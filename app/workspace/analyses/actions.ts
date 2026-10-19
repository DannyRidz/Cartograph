"use server";

import { createDatabaseClient } from "@/lib/supabase";
import { progressSnapshot } from "@/lib/analysis-progress";

// One snapshot after a successful join or rejoin closes the read/subscribe gap.
// Ongoing updates arrive through the socket, never through a timer.
export async function getProgressSnapshots(ids: string[]) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== "string"
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))) {
    throw new Error("Invalid analysis IDs.");
  }
  if (!ids.length) return [];
  const database = await createDatabaseClient();
  const { data, error } = await database.from("analyses")
    .select("id, state, stage, stage_message, failed_stage, failure_message, updated_at, is_seed")
    .in("id", ids).limit(50);
  if (error) throw new Error("Could not synchronise analysis progress.", { cause: error });
  return data.map(progressSnapshot);
}
