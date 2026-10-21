import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types.ts";

export const heartbeatIntervalMs = 30_000;

/** Renews the run lease with writes only, and never overlaps heartbeat requests. */
export async function startHeartbeat(database: SupabaseClient<Database>, id: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let stopped = false;
  async function renew() {
    try {
      const { error } = await database.rpc("heartbeat_analysis", { p_analysis_id: id })
        .abortSignal(AbortSignal.timeout(20_000));
      if (error) throw new Error(`Could not renew analysis activity: ${error.message}`, { cause: error });
    } catch (error: unknown) {
      controller.abort(error);
      throw error;
    }
  }
  function schedule() {
    timer = setTimeout(() => {
      pending = renew().catch(() => { /* Lease loss is observed through the abort signal. */ }).finally(() => {
        if (!stopped && !controller.signal.aborted) schedule();
      });
    }, heartbeatIntervalMs);
  }
  await renew();
  schedule();
  return {
    signal: controller.signal,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await pending;
    },
  };
}
