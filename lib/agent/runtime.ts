import { createHash } from 'node:crypto';

export function conversationOwner(userId: string, organizationId: string, analysisId: string) {
  return createHash('sha256').update(JSON.stringify([userId, organizationId, analysisId])).digest('hex');
}
export async function openAgentStream(options: {
  baseUrl: string; ingressSecret: string; owner: string; threadId?: string;
  credential: string; question: string; selection: { kind: 'file' | 'folder'; path: string } | null;
  signal: AbortSignal; fetcher?: typeof fetch;
}) {
  const fetcher = options.fetcher ?? fetch;
  const headers = { 'Content-Type': 'application/json', 'X-MDA-Ingress-Secret': options.ingressSecret, 'X-MDA-User-Id': options.owner };
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid agent service URL.');
  async function call(path: string, body?: unknown) {
    return fetcher(new URL(path, base), { method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: options.signal, redirect: 'error' });
  }
  let threadId = options.threadId;
  if (threadId) {
    const existing = await call(`/threads/${threadId}`);
    if (!existing.ok) throw new Error('This conversation is unavailable. Start a new conversation.');
  } else {
    const created = await call('/threads', {});
    if (!created.ok) throw new Error('The agent could not open a conversation.');
    const thread: unknown = await created.json();
    if (!thread || typeof thread !== 'object' || !('thread_id' in thread) || typeof thread.thread_id !== 'string'
      || !/^[a-f0-9-]{36}$/i.test(thread.thread_id)) throw new Error('The agent returned an invalid conversation.');
    threadId = thread.thread_id;
  }
  const response = await call(`/threads/${threadId}/runs/stream`, {
    assistant_id: 'cartograph', input: { messages: [{ role: 'user', content: JSON.stringify({ question: options.question, selection: options.selection }) }] },
    context: { credential: options.credential }, stream_mode: ['custom', 'messages-tuple'],
    on_disconnect: 'cancel', multitask_strategy: 'reject', config: { recursion_limit: 24 },
  });
  if (!response.ok || !response.body) throw new Error('The agent is unavailable or this conversation is busy.');
  return { body: response.body, threadId };
}
