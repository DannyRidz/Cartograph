import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types.ts";
import type { RepositoryResult } from "../parser/types.ts";
import { taxonomy } from "../adapters/taxonomy.ts";
import { cachedAI, contentHash } from "./cache.ts";
import { flushTraces } from "./client.ts";
import { fileContext, isSemanticRole } from "./context.ts";
import { predictRole } from "./role.ts";

export async function classifyFiles(database: SupabaseClient<Database>, root: string, repository: RepositoryResult, signal?: AbortSignal) {
  const generic = taxonomy(repository.adapter).genericRoles;
  const candidates = repository.files.filter((file) => generic.includes(file.role ?? file.kind));
  // All contexts read the parser snapshot, before any model labels are applied.
  const contexts = candidates.map((file) => fileContext(repository, file));
  const labels = new Map<string, string>();
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < contexts.length) {
      signal?.throwIfAborted();
      const context = contexts[next++];
      const source = await readFile(path.join(root, context.file.path), "utf8");
      if (contentHash(source) !== context.file.hash) throw new Error("File content changed before classification.");
      if (source.length > 200_000) throw new Error(`Cannot classify ${context.file.path}: source exceeds the 200,000 character model input limit.`);
      const result = await cachedAI(database, "role", context, async () => {
        signal?.throwIfAborted();
        return predictRole({ ...context, source }, signal);
      });
      if (!isSemanticRole(result.body)) throw new Error("The cached file role is unsupported.");
      signal?.throwIfAborted();
      labels.set(context.file.path, result.body);
    }
  }
  // Wait for every worker before temporary source files can be removed on failure.
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, candidates.length) },
    () => worker().catch((error: unknown) => { failed = true; throw error; })));
  await flushTraces();
  for (const result of results) if (result.status === "rejected") throw result.reason;
  return { ...repository, files: repository.files.map((file) => labels.has(file.path) ? { ...file, role: labels.get(file.path) } : file) };
}
