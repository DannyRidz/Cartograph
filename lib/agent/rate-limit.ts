// A bounded process local guard suits the local app. It is not a distributed quota.
const windows = new Map<string, { count: number; until: number }>();
export function allowAgentRequest(key: string, limit: number, now = Date.now()) {
  for (const [key, window] of windows) if (window.until <= now) windows.delete(key);
  let window = windows.get(key);
  if (!window) {
    if (windows.size >= 5000) return false;
    window = { count: 0, until: now + 60_000 };
    windows.set(key, window);
  }
  if (window.count >= limit) return false;
  window.count++;
  return true;
}
