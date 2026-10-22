import { encodeSse, readSse } from './sse.ts';
import { toolNames } from './queries.ts';

export type AskEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'tool'; id: string; name: string; args: Record<string, string | number>; status: 'running' | 'complete' | 'failed' }
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function parseAskEvent(value: unknown): AskEvent {
  if (!object(value)) throw new Error('Invalid answer stream.');
  if (value.type === 'done') return { type: 'done' };
  if (value.type === 'thread' && typeof value.threadId === 'string') return { type: 'thread', threadId: value.threadId };
  if (value.type === 'text' && typeof value.text === 'string') return { type: 'text', text: value.text };
  if (value.type === 'error' && typeof value.message === 'string') return { type: 'error', message: value.message };
  if (value.type === 'tool' && typeof value.id === 'string' && typeof value.name === 'string' && toolNames.some((name) => name === value.name)
    && ['running', 'complete', 'failed'].includes(String(value.status)) && object(value.args)) {
    const args: Record<string, string | number> = {};
    for (const [key, arg] of Object.entries(value.args)) {
      if (!['query', 'role', 'path', 'direction', 'depth', 'offset', 'limit'].includes(key) || (typeof arg !== 'string' && typeof arg !== 'number')) throw new Error('Invalid tool event.');
      args[key] = arg;
    }
    return { type: 'tool', id: value.id, name: value.name, args,
      status: value.status === 'running' ? 'running' : value.status === 'complete' ? 'complete' : 'failed' };
  }
  throw new Error('Invalid answer stream.');
}
function messageText(value: unknown): string {
  if (!Array.isArray(value) || !object(value[0])) return '';
  const message = value[0];
  if (!['ai', 'AIMessageChunk', 'assistant'].includes(String(message.type ?? message.role))) return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content.flatMap((part: unknown) => object(part) && ['text', 'output_text'].includes(String(part.type)) && typeof part.text === 'string' ? [part.text] : []).join('');
}

/** Forward only display events, never runtime context, metadata or credentials. */
export function relayAgentStream(body: ReadableStream<Uint8Array>, threadId: string, cancel: () => void) {
  let stopped = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => { if (!stopped) controller.enqueue(encodeSse('ask', event)); };
      let lookedUp = false;
      let answered = false;
      send({ type: 'thread', threadId });
      try {
        for await (const chunk of readSse(body)) {
          if (chunk.event === 'error') throw new Error('Agent run failed.');
          if (chunk.event === 'custom') {
            const event = parseAskEvent(JSON.parse(chunk.data));
            if (event.type !== 'tool') continue;
            if (event.status === 'running') lookedUp = true;
            send(event);
          } else if (chunk.event === 'messages' || chunk.event === 'messages-tuple') {
            const text = messageText(JSON.parse(chunk.data));
            if (text && lookedUp) { answered = true; send({ type: 'text', text }); }
          }
        }
        if (!lookedUp || !answered) throw new Error('No grounded answer was returned.');
        send({ type: 'done' });
      } catch {
        send({ type: 'error', message: 'The answer was interrupted. Try again or start a new conversation.' });
      } finally { if (!stopped) controller.close(); }
    },
    cancel() { stopped = true; cancel(); },
  });
}
