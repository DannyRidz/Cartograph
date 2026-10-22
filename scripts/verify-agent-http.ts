import './lib/environment.ts';
import { conversationOwner, openAgentStream } from '../lib/agent/runtime.ts';
import { relayAgentStream, parseAskEvent } from '../lib/agent/stream.ts';
import { readSse } from '../lib/agent/sse.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types.ts';
import { signCredential, credentialHash } from '../lib/agent/credential.ts';
import { prepareRepositoryQuery } from '../lib/agent/queries.ts';
import { readStoredRepository } from '../lib/stored-repository.ts';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3000');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Verification sends a short lived bearer only to the local app.');
const connection = process.env.SUPABASE_DB_URL;
const secret = process.env.CARTOGRAPH_AGENT_SIGNING_SECRET;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!connection || !secret || !apiUrl || !apiKey) throw new Error('Set the database setup URL, signing secret and publishable Supabase configuration in .env.local.');
const url = new URL(connection);
function sql(statement: string) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement], {
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '10' }, encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Agent HTTP verification database setup failed: ${result.stderr}`);
  return result.stdout.trim();
}
// Existing real analysis only; the setup credential never enters an HTTP request.
const candidate: unknown = JSON.parse(sql("select json_build_object('id', id, 'organizationId', organization_id) from public.analyses where state = 'completed' and not is_seed order by created_at desc limit 1"));
if (!candidate || typeof candidate !== 'object' || !('id' in candidate) || typeof candidate.id !== 'string'
  || !('organizationId' in candidate) || typeof candidate.organizationId !== 'string') throw new Error('A real completed analysis is required.');
const signed = signCredential(candidate.id, candidate.organizationId, secret);
const hash = credentialHash(signed.token);
const expiresAt = new Date(signed.claims.expiresAt * 1000).toISOString();
// signCredential validates both scope strings; hash and ISO expiry are server generated.
sql(`begin; set local role authenticated; set local request.jwt.claims = '{"role":"authenticated","o":{"id":"${signed.claims.organizationId}"}}';
 insert into public.agent_tool_grants(token_hash, organization_id, analysis_id, expires_at)
 values('${hash}','${signed.claims.organizationId}','${signed.claims.analysisId}','${expiresAt}'); commit;`);
async function request(tool: string, params = '', token: string | null = signed.token, method = 'GET') {
  return fetch(new URL(`/api/agent/tools/${tool}${params ? `?${params}` : ''}`, base), {
    method, headers: token === null ? {} : { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000),
  });
}
try {
  const database = createClient<Database>(apiUrl, apiKey, { global: { headers: { 'x-cartograph-agent-token': signed.token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const scoped = await database.from('analyses').select('id, organization_id, schema_version, adapter, coverage').limit(2);
  assert.equal(scoped.error, null);
  assert.equal(scoped.data?.length, 1);
  const row = scoped.data?.[0];
  assert.ok(row);
  assert.equal(row.id, signed.claims.analysisId);
  assert.equal(row.organization_id, signed.claims.organizationId);
  const repository = await readStoredRepository(database, row.id, row);
  assert.ok(repository.files.length, 'A real analysis containing parsed files is required');
  const path = repository.files[0].path;
  const parameters = new URLSearchParams({ path, direction: 'incoming', limit: '1' });
  const requests = [
    ['analysis_summary', ''], ['search_files', new URLSearchParams({ query: path, limit: '1' }).toString()],
    ['files_by_role', new URLSearchParams({ role: repository.files[0].role ?? repository.files[0].kind, limit: '1' }).toString()],
    ['file_neighbours', parameters.toString()], ['walk_dependencies', `${parameters}&depth=3`], ['route_table', 'limit=1'],
  ];
  for (const [tool, params] of requests) {
    const response = await request(tool, params);
    assert.equal(response.status, 200, `${tool}: ${await response.clone().text()}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), prepareRepositoryQuery(tool, new URLSearchParams(params))(repository));
  }
  assert.equal((await request('analysis_summary', '', null)).status, 401);
  assert.equal((await request('analysis_summary', '', `${signed.token}x`)).status, 401);
  assert.equal((await request('analysis_summary', '', signCredential(row.id, row.organization_id, secret, Date.now() - 300_000).token)).status, 401);
  assert.equal((await request('analysis_summary', '', signCredential(row.id, row.organization_id, secret).token)).status, 401, 'Unregistered signed credentials must fail');
  assert.equal((await request('analysis_summary', 'analysisId=another')).status, 400);
  assert.equal((await request('search_files', 'query=a&limit=101')).status, 400);
  assert.equal((await request('analysis_summary', '', signed.token, 'POST')).status, 405);
  if (process.argv.includes('--agent')) {
    const baseUrl = process.env.CARTOGRAPH_AGENT_URL;
    const ingressSecret = process.env.MDA_INGRESS_SECRET;
    if (!baseUrl || !ingressSecret) throw new Error('Configure the agent URL and backend ingress secret.');
    const owner = conversationOwner('terminal-verification', row.organization_id, row.id);
    const abort = new AbortController();
    const stream = await openAgentStream({ baseUrl, ingressSecret, owner, credential: signed.token,
      question: 'Use only the repository summary lookup and state only the parsed file count.', selection: null,
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]) });
    try {
      let started = false, finished = false, text = false, done = false;
      for await (const chunk of readSse(relayAgentStream(stream.body, stream.threadId, () => abort.abort()))) {
        const event = parseAskEvent(JSON.parse(chunk.data));
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'tool' && event.status === 'running') { started = true; console.log(`Live lookup started: ${event.name}`); }
        if (event.type === 'tool' && event.status === 'complete') { finished = true; console.log(`Live lookup completed: ${event.name}`); }
        if (event.type === 'text') { assert.ok(started); text = true; }
        if (event.type === 'done') done = true;
      }
      assert.ok(started && finished && text && done, 'Expected live lookup start, completion and streamed answer');
      console.log('Live managed runtime: HTTP lookup start/completion arrived before a streamed model answer.');
    } finally {
      abort.abort();
      const removed = await fetch(new URL(`/threads/${stream.threadId}`, baseUrl), { method: 'DELETE', headers: {
        'X-MDA-Ingress-Secret': ingressSecret, 'X-MDA-User-Id': owner,
      } });
      assert.ok(removed.ok, 'Temporary runtime conversation cleanup must succeed');
    }
  }
  sql(`delete from public.agent_tool_grants where token_hash = '${hash}'`);
  assert.equal((await request('analysis_summary')).status, 401, 'Deleted grants must fail');
  console.log('Six live HTTP tools match canonical queries. Publishable-key RLS, missing/tampered/expired/unregistered/revoked credentials, invalid parameters and writes verified.');
} finally {
  sql(`delete from public.agent_tool_grants where token_hash = '${hash}'`);
}
