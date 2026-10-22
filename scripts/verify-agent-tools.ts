import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { signCredential, verifyCredential, credentialHash } from '../lib/agent/credential.ts';
import { prepareRepositoryQuery, repositoryQueries, toolNames } from '../lib/agent/queries.ts';
import { allowAgentRequest } from '../lib/agent/rate-limit.ts';
import { readRepositoryResult } from '../lib/parser/data.ts';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types.ts';
import { registerAgentCredential } from '../lib/agent/grant.ts';

const secret = randomBytes(32).toString('hex');
const id = '26c8b504-9624-4710-85f4-18424bbd82bd';
const now = Date.now();
const { token, claims } = signCredential(id, 'org_AgentCheck', secret, now);
assert.deepEqual(verifyCredential(token, secret, now), claims);
assert.notEqual(signCredential(id, 'org_AgentCheck', secret, now).token, token);
assert.equal(credentialHash(token).length, 64);
assert.throws(() => verifyCredential(token, secret, now + 300_000), /expired/);
assert.throws(() => verifyCredential(token, secret, now - 1000), /expired/);
assert.throws(() => verifyCredential(token, randomBytes(32).toString('hex'), now), /Invalid/);
const [payload, signature] = token.split('.');
const changed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
changed.analysisId = '16c8b504-9624-4710-85f4-18424bbd82bd';
assert.throws(() => verifyCredential(`${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`, secret, now));
changed.analysisId = id; changed.organizationId = 'org_Other';
assert.throws(() => verifyCredential(`${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`, secret, now));
assert.throws(() => verifyCredential(`${token}.extra`, secret));
assert.throws(() => signCredential(id, 'org_AgentCheck', 'short'));
const realNow = Date.now;
let registrations = 0;
let clockResponse: Response = Response.json(new Date(now).toISOString());
let failInsert = false;
const database = createClient<Database>('https://database.example', 'publishable-test', { global: { fetch: async (input, init) => {
  if (String(input).endsWith('/rpc/agent_credential_time')) return clockResponse.clone();
  assert.ok(String(input).endsWith('/agent_tool_grants'));
  registrations++;
  const row = JSON.parse(String(init?.body));
  assert.equal(row.created_at, new Date(Math.floor(now / 1000) * 1000).toISOString());
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 300_000);
  return failInsert ? Response.json({ message: 'Denied' }, { status: 403 }) : new Response(null, { status: 201 });
} }, auth: { persistSession: false, autoRefreshToken: false } });
try {
  for (const skew of [-60_000, 60_000]) {
    Date.now = () => now + skew;
    const result = await registerAgentCredential(database, id, 'org_AgentCheck', secret);
    assert.equal(verifyCredential(result.credential, secret, now).issuedAt, Math.floor(now / 1000));
  }
  const before = registrations;
  clockResponse = Response.json('not-a-time');
  await assert.rejects(registerAgentCredential(database, id, 'org_AgentCheck', secret), /credential time/);
  clockResponse = Response.json({ message: 'Denied' }, { status: 403 });
  await assert.rejects(registerAgentCredential(database, id, 'org_AgentCheck', secret), /credential time/);
  assert.equal(registrations, before, 'Clock failure must not issue a grant');
  clockResponse = Response.json(new Date(now).toISOString()); failInsert = true;
  await assert.rejects(registerAgentCredential(database, id, 'org_AgentCheck', secret), /register/);
} finally { Date.now = realNow; }

const repository = await readRepositoryResult('lib/fixtures/redux-toolkit.json');
const queries = repositoryQueries(repository);
const path = repository.files[0].path;
const args = { analysis_summary: '', search_files: 'query=api', files_by_role: 'role=module',
  file_neighbours: `path=${encodeURIComponent(path)}&direction=incoming`,
  walk_dependencies: `path=${encodeURIComponent(path)}&direction=outgoing&depth=3`, route_table: '' };
for (const name of toolNames) {
  const params = new URLSearchParams(args[name]);
  const result = prepareRepositoryQuery(name, params)(repository);
  assert.ok(result);
  params.set('analysisId', id);
  assert.throws(() => prepareRepositoryQuery(name, params));
}
assert.deepEqual(prepareRepositoryQuery('analysis_summary', new URLSearchParams())(repository), queries.analysis_summary());
for (const args of ['query=a&limit=101', 'query=a&offset=-1', 'query=a&limit=1&limit=2', 'query=a&organizationId=org_Other', 'query=']) {
  assert.throws(() => prepareRepositoryQuery('search_files', new URLSearchParams(args)));
}
assert.throws(() => prepareRepositoryQuery('not-a-tool', new URLSearchParams()));
assert.throws(() => prepareRepositoryQuery('walk_dependencies', new URLSearchParams(`path=${path}&direction=outgoing&depth=1.5`)));
assert.equal(allowAgentRequest('test:one', 1, now), true);
assert.equal(allowAgentRequest('test:one', 1, now), false);
assert.equal(allowAgentRequest('test:other', 1, now), true);
assert.equal(allowAgentRequest('test:one', 1, now + 60_000), true);
console.log('Agent credentials: exact scope, signatures, expiry, nonce uniqueness, tool arguments and request limits passed.');
