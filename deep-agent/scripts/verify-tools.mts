import assert from 'node:assert/strict';
import { readRepositoryResult } from '../shared/lib/parser/data.ts';
import { indexGraph, walkGraph } from '../shared/lib/canvas/graph.ts';
import { repositoryDetails } from '../shared/lib/canvas/details.ts';
import { createRepositoryTools } from '../tools/repository.ts';

const repository = await readRepositoryResult(new URL('../shared/lib/fixtures/redux-toolkit.json', import.meta.url).pathname);
const [summary, search, roles, neighbours, walk, routes] = createRepositoryTools(repository);
assert.equal(new Set([summary, search, roles, neighbours, walk, routes].map((item) => item.name)).size, 6);
assert.equal((await summary.invoke({})).files, repository.files.length);
const path = repository.edges[0].from;
const found = await search.invoke({ query: path.toUpperCase(), limit: 1 });
assert.equal(found.items[0].path, path);
assert.deepEqual((await search.invoke({ query: 'no-such-file-831af' })).items, []);
const role = repository.files[0].role ?? repository.files[0].kind;
assert.equal((await roles.invoke({ role })).total, repository.files.filter((file) => (file.role ?? file.kind) === role).length);
assert.equal((await roles.invoke({ role: 'not-a-recorded-role' })).total, 0);
const graph = indexGraph(repository.files, repository.edges);
const details = repositoryDetails(repository.files, repository.edges);
for (const direction of ['incoming', 'outgoing'] as const) {
  const direct = await neighbours.invoke({ path, direction, limit: 100 });
  assert.ok('items' in direct);
  assert.deepEqual(direct.items, (direction === 'incoming' ? details.files.get(path)?.dependents : details.files.get(path)?.imports)?.slice(0, 100));
  const reached = await walk.invoke({ path, direction, depth: 4, limit: 1 });
  assert.ok('items' in reached);
  const expected = walkGraph(graph, path, direction, 4);
  assert.deepEqual(reached.items, expected.slice(0, 1));
  assert.equal(reached.total, expected.length);
  assert.equal(reached.nextOffset, expected.length > 1 ? 1 : null);
  const zero = await walk.invoke({ path, direction, depth: 0 });
  assert.ok('items' in zero);
  assert.deepEqual(zero.items, []);
}
assert.ok('error' in await neighbours.invoke({ path: 'absent', direction: 'incoming' }));
assert.ok('error' in await walk.invoke({ path: 'absent', direction: 'outgoing' }));
await assert.rejects(walk.invoke({ path, direction: 'incoming', depth: -1 }));
await assert.rejects(search.invoke({ query: 'a', limit: 101 }));
assert.throws(() => summary.schema.parse({ analysisId: 'another-analysis' }));
assert.equal((await routes.invoke({})).total, repository.routes?.length ?? 0);
const withRoute = createRepositoryTools({ ...repository, routes: [{ file: path, path: '/exact', method: 'GET' }] });
assert.deepEqual((await withRoute[5].invoke({})).items, [{ file: path, path: '/exact', method: 'GET' }]);
console.log('Six tools verified against the canonical graph functions. Pagination, absent data and invalid inputs checked. No model calls.');

// Verify turn boundaries and model tool restrictions without provider requests.
const { createAgent, createMiddleware, FakeToolCallingModel } = await import('langchain');
const { lookupOnly } = await import('../middleware/lookups.ts');
const choices: (string | undefined)[] = [];
const names = new Set<string>([summary, search, roles, neighbours, walk, routes].map((item) => item.name));
const probe = createMiddleware({
  name: 'VerifyLookupRequests',
  wrapModelCall: (request, handler) => {
    choices.push(typeof request.toolChoice === 'string' ? request.toolChoice : undefined);
    assert.equal(request.tools.length, 6);
    assert.ok(request.tools.every((item) => 'name' in item && names.has(String(item.name))));
    return handler(request);
  },
});
const fake = new FakeToolCallingModel({ toolCalls: [
  [{ name: 'analysis_summary', args: {}, id: 'first-lookup' }], [],
  [{ name: 'analysis_summary', args: {}, id: 'followup-lookup' }], [],
] });
const { tool } = await import('@langchain/core/tools');
const { z } = await import('zod');
const forbidden = tool(() => { throw new Error('Forbidden tool executed'); }, { name: 'write_file', description: 'Unavailable runtime tool', schema: z.object({}) });
const harness = createAgent({ model: fake, tools: [...createRepositoryTools(repository), forbidden], middleware: [lookupOnly([...names]), probe] });
const first = await harness.invoke({ messages: [{ role: 'user', content: 'Where are the files?' }] });
await harness.invoke({ messages: [...first.messages, { role: 'user', content: 'What imports those?' }] });
assert.deepEqual(choices, ['required', 'auto', 'required', 'auto']);
const noLookup = createAgent({ model: new FakeToolCallingModel(), tools: [...createRepositoryTools(repository)], middleware: [lookupOnly([...names])] });
await assert.rejects(noLookup.invoke({ messages: [{ role: 'user', content: 'Judge the code.' }] }), /without a repository lookup/);
console.log('Lookup required on both turns; only six tools exposed; an answer without a lookup fails loudly.');
const { HumanMessage, AIMessage, ToolMessage } = await import('@langchain/core/messages');
const failedChoices: (string | undefined)[] = [];
const failedProbe = createMiddleware({ name: 'VerifyFailedLookup', wrapModelCall: (request, handler) => {
  failedChoices.push(typeof request.toolChoice === 'string' ? request.toolChoice : undefined);
  return handler(request);
} });
const afterFailedLookup = createAgent({ model: new FakeToolCallingModel(), tools: [...createRepositoryTools(repository)], middleware: [lookupOnly([...names]), failedProbe] });
await assert.rejects(afterFailedLookup.invoke({ messages: [
  new HumanMessage('Read the summary'),
  new AIMessage({ content: '', tool_calls: [{ name: 'analysis_summary', args: {}, id: 'failed' }] }),
  new ToolMessage({ content: 'Lookup failed', name: 'analysis_summary', tool_call_id: 'failed', status: 'error' }),
] }), /without a repository lookup/);
assert.deepEqual(failedChoices, ['required']);

// Service lookups use private runtime context and publish tool events around HTTP.
const { createHttpTools, contextSchema } = await import('../tools/http.ts');
const originalFetch = globalThis.fetch;
const originalUrl = process.env.CARTOGRAPH_APP_URL;
const streamed: unknown[] = [];
try {
  process.env.CARTOGRAPH_APP_URL = 'http://127.0.0.1:3000';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:3000/api/agent/tools/analysis_summary');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer private-test-credential');
    return Response.json({ files: 2 });
  };
  const httpTools = createHttpTools();
  const httpAgent = createAgent({ contextSchema, model: new FakeToolCallingModel({ toolCalls: [
    [{ name: 'analysis_summary', args: {}, id: 'http-lookup' }], [],
  ] }), tools: httpTools, middleware: [lookupOnly(httpTools.map((item) => item.name))] });
  const stream = await httpAgent.stream({ messages: [{ role: 'user', content: 'Read the summary' }] }, {
    context: { credential: 'private-test-credential' }, streamMode: 'custom',
  });
  for await (const event of stream) streamed.push(event);
  assert.deepEqual(streamed, [
    { type: 'tool', id: 'http-lookup', name: 'analysis_summary', args: {}, status: 'running' },
    { type: 'tool', id: 'http-lookup', name: 'analysis_summary', args: {}, status: 'complete' },
  ]);
  assert.equal(JSON.stringify(streamed).includes('private-test-credential'), false);
  console.log('HTTP service tools: private context, fixed endpoint and streamed lookup start/completion passed with local responses.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.CARTOGRAPH_APP_URL;
  else process.env.CARTOGRAPH_APP_URL = originalUrl;
}
