import assert from "node:assert/strict";
import { mock } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types.ts";
import { startHeartbeat, heartbeatIntervalMs } from "../lib/pipeline/heartbeat.ts";

async function main() {
  mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let release: ((response: Response) => void) | undefined;
  const database = createClient<Database>("https://verification.invalid", "verification-key", {
    global: { fetch: async () => {
      calls++;
      if (calls === 1) return new Response(null, { status: 204 });
      return new Promise<Response>((resolve) => { release = resolve; });
    } },
  });
  try {
    const heartbeat = await startHeartbeat(database, "verification-run");
    assert.equal(calls, 1, "Renew before starting repository work.");
    mock.timers.tick(heartbeatIntervalMs);
    await setImmediate();
    assert.equal(calls, 2);
    mock.timers.tick(heartbeatIntervalMs * 3);
    await setImmediate();
    assert.equal(calls, 2, "Do not overlap renewal requests.");
    assert(release);
    release(Response.json({ message: "Lease expired" }, { status: 400 }));
    await setImmediate();
    await heartbeat.stop();
    assert(heartbeat.signal.aborted, "Lease loss must abort further work.");
    assert.throws(() => heartbeat.signal.throwIfAborted(), /Could not renew analysis activity/);
    mock.timers.tick(heartbeatIntervalMs * 3);
    assert.equal(calls, 2, "Never renew again after losing the lease.");

    let successfulCalls = 0;
    const healthy = createClient<Database>("https://verification.invalid", "verification-key", {
      global: { fetch: async () => { successfulCalls++; return new Response(null, { status: 204 }); } },
    });
    const live = await startHeartbeat(healthy, "healthy-run");
    mock.timers.tick(heartbeatIntervalMs);
    await setImmediate();
    assert.equal(successfulCalls, 2);
    await live.stop();
    mock.timers.tick(heartbeatIntervalMs * 3);
    assert.equal(successfulCalls, 2, "Stop renewal before final result storage.");
    assert(!live.signal.aborted);
    console.log("Heartbeat verified: immediate renewal, 30 second cadence, no overlaps, abort on failure and cleanup before storage.");
  } finally { mock.timers.reset(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
