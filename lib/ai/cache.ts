import { createHash } from "node:crypto";
import { traceable } from "langsmith/traceable";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types.ts";
import { MODEL, traceClient, tracingConfigured } from "./client.ts";

export const contentHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type AIKind = "file" | "folder" | "role";

export async function cachedAI(database: SupabaseClient<Database>, kind: AIKind, input: object, generate: () => Promise<string>) {
  const cacheKey = contentHash(JSON.stringify({ revision: 1, model: MODEL, kind, input }));
  // The database read belongs inside the parent trace. A hit has no LLM child.
  const run = traceable(async (request: { cacheKey: string; kind: AIKind; model: string }) => {
    const { data, error } = await database.from("ai_cache").select("body")
      .eq("cache_key", request.cacheKey).limit(1).maybeSingle();
    if (error) throw new Error("Could not read the AI cache.", { cause: error });
    if (data) return { body: data.body, cached: true, usage_metadata: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } };
    const body = await generate();
    const { error: writeError } = await database.from("ai_cache").upsert({ cache_key: cacheKey, model: MODEL, kind, body },
      { onConflict: "organization_id,cache_key", ignoreDuplicates: true });
    if (writeError) throw new Error("Could not save the AI cache.", { cause: writeError });
    return { body, cached: false };
  }, { name: `cartograph.${kind}`, run_type: "chain", client: traceClient(), tracingEnabled: tracingConfigured(),
    project_name: process.env.LANGSMITH_PROJECT ?? "Cartograph", metadata: { model: MODEL } });
  return run({ cacheKey, kind, model: MODEL });
}
