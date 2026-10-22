/** Bound allocation and read time even when Content-Length is absent or false. */
export async function readLimitedText(request: Request, limit = 16 * 1024, timeoutMs = 10_000) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interruptedRead = false;
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => {
      interruptedRead = true;
      reject(new Error('Request body read was interrupted.'));
      void reader.cancel().catch(() => {});
    };
    timer = setTimeout(abort, timeoutMs);
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
  });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (interruptedRead) throw new Error('Request body read was interrupted.');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw new Error('Request body is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
