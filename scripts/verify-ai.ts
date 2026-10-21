import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { getCurrentRunTree } from "langsmith/traceable";
import type { Database } from "../lib/database.types.ts";
import { cachedAI } from "../lib/ai/cache.ts";
import { MODEL, flushTraces } from "../lib/ai/client.ts";
import { fileContext, isSemanticRole } from "../lib/ai/context.ts";
import type { RepositoryResult } from "../lib/parser/types.ts";

async function main() {
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = "verification-only-key";
  const originalFetch = globalThis.fetch;
  // No external traffic. This also exercises traced cache hits without a model.
  globalThis.fetch = async () => Response.json({ batch_ingest_config: { use_multipart_endpoint: false } });
  const saved = new Map<string, string>();
  let generated = 0;
  let reads = 0;
  const roots = new Set<string>();
  const database = createClient<Database>("https://database.invalid", "verification-key", {
    global: { fetch: async (input, init) => {
      const run = getCurrentRunTree();
      assert.match(run.name, /^cartograph\./);
      roots.add(run.id);
      const url = new URL(String(input));
      if (init?.method === "POST") {
        const value: unknown = JSON.parse(String(init.body));
        assert(value && typeof value === "object" && "model" in value && value.model === MODEL
          && "cache_key" in value && typeof value.cache_key === "string" && "body" in value && typeof value.body === "string");
        saved.set(value.cache_key, value.body);
        return new Response(null, { status: 201 });
      }
      reads++;
      const key = url.searchParams.get("cache_key")?.replace(/^eq\./, "");
      return Response.json(key && saved.has(key) ? { body: saved.get(key) } : null);
    } },
  });
  try {
    const generate = async () => { generated++; return "A real explanation."; };
    const first = await cachedAI(database, "file", { hash: "first", neighbours: ["a.ts", "b.ts"] }, generate);
    const hit = await cachedAI(database, "file", { hash: "first", neighbours: ["a.ts", "b.ts"] }, generate);
    assert.equal(first.cached, false);
    assert.equal(hit.cached, true);
    assert.equal(hit.body, first.body);
    assert.deepEqual(hit.usage_metadata, { input_tokens: 0, output_tokens: 0, total_tokens: 0 });
    assert.equal(generated, 1);
    assert.equal(roots.size, 2, "Every cache lookup has its own parent run.");
    await cachedAI(database, "file", { hash: "changed", neighbours: ["a.ts", "b.ts"] }, generate);
    await cachedAI(database, "file", { hash: "first", neighbours: ["a.ts", "c.ts"] }, generate);
    await cachedAI(database, "folder", { hash: "first", neighbours: ["a.ts", "b.ts"] }, generate);
    assert.equal(generated, 4, "Content, neighbours and target kind each invalidate the cache.");
    assert.equal(reads, 5);
    const file = (path: string) => ({ path, folder: ".", module: ".", kind: "module" as const, hash: "a".repeat(64), lineCount: 1, fanIn: 0, fanOut: 0 });
    const repository: RepositoryResult = { schemaVersion: 1, adapter: "fallback", files: [file("a.ts"), file("b.ts"), file("c.ts"), file("d.ts")],
      edges: [{ from: "a.ts", to: "b.ts", kind: "import" }, { from: "c.ts", to: "a.ts", kind: "import" }, { from: "b.ts", to: "d.ts", kind: "import" }],
      coverage: { filesFound: 4, filesParsed: 4, filesSkipped: 0, folders: 1, skipped: [], excludedDirectories: [], imports: [], totals: { resolved: 0, external: 0, excluded: 0, unresolved: 0 } } };
    const context = fileContext(repository, repository.files[0]);
    assert.deepEqual(context.imports.map((item) => item.path), ["b.ts"]);
    assert.deepEqual(context.importedBy.map((item) => item.path), ["c.ts"]);
    for (const role of ["page", "route", "controller", "api", "router"]) assert.equal(isSemanticRole(role), false);
    assert.equal(isSemanticRole("service"), true);
    console.log("AI verified: cache reads inside distinct traces, zero-token hits, content and neighbour invalidation, complete direct neighbours, structural roles rejected.");
  } finally {
    await flushTraces();
    globalThis.fetch = originalFetch;
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
