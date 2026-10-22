import assert from 'node:assert/strict';
import { readSse, encodeSse } from '../lib/agent/sse.ts';
import { relayAgentStream, parseAskEvent } from '../lib/agent/stream.ts';
import { conversationOwner, openAgentStream } from '../lib/agent/runtime.ts';
import { readLimitedText } from '../lib/agent/request.ts';

const encoder = new TextEncoder();
function bodyRequest(body: ReadableStream<Uint8Array>, headers?: HeadersInit, signal?: AbortSignal) {
  const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, headers, signal, duplex: 'half' };
  return new Request('http://localhost', init);
}
const exactBody = encoder.encode('é'.repeat(8192));
assert.equal((await readLimitedText(bodyRequest(new ReadableStream({ start(controller) {
  controller.enqueue(exactBody.slice(0, 1)); controller.enqueue(exactBody.slice(1)); controller.close();
} })))).length, 8192, 'Accept exactly 16 KiB and split UTF-8');
for (const headers of [undefined, { 'content-length': '1' }]) {
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(exactBody); controller.enqueue(encoder.encode('é'));
  }, cancel() { cancelled = true; } });
  await assert.rejects(readLimitedText(bodyRequest(oversized, headers)), /too large/);
  assert.equal(cancelled, true, 'Cancel oversized bodies without depending on Content-Length');
}
let timedOut = false;
await assert.rejects(readLimitedText(bodyRequest(new ReadableStream({ cancel() { timedOut = true; } })), 16384, 10), /interrupted/);
assert.equal(timedOut, true);
const aborted = AbortSignal.abort();
await assert.rejects(readLimitedText(bodyRequest(new ReadableStream(), undefined, aborted)), /interrupted/);
assert.equal(await readLimitedText(new Request('http://localhost')), '');
let inputController: ReadableStreamDefaultController<Uint8Array> | undefined;
const input = new ReadableStream<Uint8Array>({ start(controller) { inputController = controller; } });
const output = readSse(relayAgentStream(input, 'thread', () => {}));
assert.equal(parseAskEvent(JSON.parse((await output.next()).value?.data ?? '')).type, 'thread');
const start = encodeSse('custom', { type: 'tool', id: 'lookup', name: 'search_files', args: { query: 'auth' }, status: 'running' });
inputController?.enqueue(start.slice(0, 13));
inputController?.enqueue(start.slice(13));
const running = parseAskEvent(JSON.parse((await output.next()).value?.data ?? ''));
assert.equal(running.type, 'tool', 'Tool start must arrive while upstream remains open');
if (running.type === 'tool') assert.equal(running.status, 'running');
inputController?.enqueue(encodeSse('metadata', { credential: 'never-forward', analysisId: 'never-forward' }));
inputController?.enqueue(encodeSse('custom', { type: 'tool', id: 'lookup', name: 'search_files', args: { query: 'auth' }, status: 'complete' }));
inputController?.enqueue(encodeSse('messages', [{ type: 'ai', content: [{ type: 'text', text: 'Found café.ts' }] }, { private: 'never-forward' }]));
inputController?.close();
const rest = [];
for await (const chunk of output) rest.push(parseAskEvent(JSON.parse(chunk.data)));
assert.deepEqual(rest.map((item) => item.type), ['tool', 'text', 'done']);
assert.equal(JSON.stringify(rest).includes('never-forward'), false);
const bytes = encoder.encode('event: test\r\ndata: café\r\ndata: second line\r\n\r\n');
const split = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
const decoded = [];
for await (const item of readSse(split)) decoded.push(item);
assert.deepEqual(decoded, [{ event: 'test', data: 'café\nsecond line' }]);
const missingLookup = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encodeSse('messages', [{ type: 'ai', content: 'Ungrounded answer' }, {}])); controller.close(); } });
const rejected = [];
for await (const item of readSse(relayAgentStream(missingLookup, 'thread', () => {}))) rejected.push(parseAskEvent(JSON.parse(item.data)));
assert.deepEqual(rejected.map((item) => item.type), ['thread', 'error']);
for (const status of ['running', 'failed']) {
  const failedLookup = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(encodeSse('custom', { type: 'tool', id: 'failed', name: 'analysis_summary', args: {}, status: 'running' }));
    if (status === 'failed') controller.enqueue(encodeSse('custom', { type: 'tool', id: 'failed', name: 'analysis_summary', args: {}, status }));
    controller.enqueue(encodeSse('messages', [{ type: 'ai', content: 'Ungrounded answer' }, {}]));
    controller.close();
  } });
  const events = [];
  for await (const item of readSse(relayAgentStream(failedLookup, 'thread', () => {}))) events.push(parseAskEvent(JSON.parse(item.data)));
  assert.equal(events.some((event) => event.type === 'text' || event.type === 'done'), false, `${status} lookups cannot unlock answers`);
  assert.equal(events.at(-1)?.type, 'error');
}
assert.throws(() => parseAskEvent({ type: 'tool', id: 'x', name: 'search_files', args: { credential: 'secret' }, status: 'running' }));
const calls: { url: URL; body?: Record<string, unknown>; headers: Headers }[] = [];
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const threadId = 'e2b14821-df72-4094-b15f-8247df1f963e';
const fake: typeof fetch = async (url, init) => {
  const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
  assert.ok(body === undefined || object(body));
  calls.push({ url: new URL(String(url)), body, headers: new Headers(init?.headers) });
  return String(url).endsWith('/threads') ? Response.json({ thread_id: threadId })
    : String(url).endsWith('/runs/stream') ? new Response('event: end\n\n') : Response.json({ thread_id: threadId });
};
const options = { baseUrl: 'http://127.0.0.1:2024', ingressSecret: 'private-ingress', owner: conversationOwner('user', 'org', 'analysis'), credential: 'private-bearer', question: 'Find imports', selection: { kind: 'file' as const, path: 'auth.ts' }, signal: new AbortController().signal, fetcher: fake };
await openAgentStream(options);
await openAgentStream({ ...options, threadId });
assert.deepEqual(calls.map((call) => call.url.pathname), ['/threads', `/threads/${threadId}/runs/stream`, `/threads/${threadId}`, `/threads/${threadId}/runs/stream`]);
assert.equal(calls[0].headers.get('X-MDA-Ingress-Secret'), 'private-ingress');
assert.equal(calls[0].headers.get('X-MDA-User-Id'), options.owner);
assert.notEqual(options.owner, conversationOwner('user', 'org', 'other-analysis'));
assert.notEqual(options.owner, conversationOwner('other-user', 'org', 'analysis'));
assert.equal(JSON.stringify(calls[1].body?.input).includes('private-bearer'), false);
assert.deepEqual(calls[1].body?.context, { credential: 'private-bearer' });
assert.equal(calls[1].body?.on_disconnect, 'cancel');
await assert.rejects(openAgentStream({ ...options, threadId, fetcher: async () => new Response(null, { status: 404 }) }), /conversation is unavailable/);
await assert.rejects(openAgentStream({ ...options, fetcher: async () => { throw new Error('offline'); } }), /offline/);
console.log('Incremental SSE, UTF-8 framing, visible lookup events, secret filtering, required lookups, thread reuse, analysis/user isolation and unreachable service handling passed.');
