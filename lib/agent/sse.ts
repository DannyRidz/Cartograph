export interface SseEvent { event: string; data: string }

/** Incremental SSE decoding, including split UTF-8, CRLF and multiline data. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  function line(value: string): SseEvent | undefined {
    if (!value) {
      const result = data.length ? { event, data: data.join('\n') } : undefined;
      event = 'message'; data = [];
      return result;
    }
    if (value.startsWith('event:')) event = value.slice(6).trimStart();
    else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const next = line(buffer.slice(0, end).replace(/\r$/, ''));
        buffer = buffer.slice(end + 1);
        if (next) yield next;
      }
      if (done) {
        if (buffer) { const next = line(buffer.replace(/\r$/, '')); if (next) yield next; }
        const last = line(''); if (last) yield last;
        break;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function encodeSse(event: string, data: unknown) {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
