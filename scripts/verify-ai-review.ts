import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types.ts";
import type { RepositoryResult } from "../lib/parser/types.ts";
import { classifyFiles } from "../lib/ai/classify.ts";
import { contentHash } from "../lib/ai/cache.ts";
import { repositoryHead, repositorySource } from "../lib/ai/repository-source.ts";
import { publicRepository } from "../lib/pipeline/repository.ts";

async function main() {
  process.env.LANGSMITH_TRACING = "false";
  const root = await mkdtemp(path.join(tmpdir(), "cartograph-review-"));
  const originalFetch = globalThis.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  const source = "export const value = 1;\n";
  const file = (name: string, body = source) => ({ path: name, folder: ".", module: ".", kind: "module" as const,
    hash: contentHash(body), lineCount: 1, fanIn: 0, fanOut: 0 });
  const repository: RepositoryResult = { schemaVersion: 1, adapter: "fallback", files: Array.from({ length: 12 }, (_, index) => file(`file-${index}.ts`)), edges: [],
    coverage: { filesFound: 12, filesParsed: 12, filesSkipped: 0, folders: 1, skipped: [], excludedDirectories: [], imports: [], totals: { resolved: 0, external: 0, excluded: 0, unresolved: 0 } } };
  try {
    await Promise.all(repository.files.map((member) => writeFile(path.join(root, member.path), source)));
    let reads = 0;
    let pending = 0;
    const database = createClient<Database>("https://verification.invalid", "verification-key", {
      global: { fetch: async () => {
        reads++;
        if (reads === 1) return Response.json({ message: "Deliberate cache failure" }, { status: 400 });
        pending++;
        // Let the first rejection propagate before the other in-flight reads finish.
        await new Promise((resolve) => setTimeout(resolve, 10));
        pending--;
        return Response.json({ body: "util" });
      } },
    });
    await assert.rejects(classifyFiles(database, root, repository), /Could not read the AI cache/);
    assert(reads <= 4, `Workers kept dispatching after failure: ${reads} reads.`);
    assert.equal(pending, 0, "In-flight workers must settle before classification rejects.");

    const large = "x".repeat(200_001);
    await writeFile(path.join(root, "large.ts"), large);
    const before = reads;
    await assert.rejects(classifyFiles(database, root, { ...repository, files: [file("large.ts", large)] }), /large.ts.*200,000 character/);
    assert.equal(reads, before, "Oversized sources must fail before an AI cache or model request.");

    const requests: { url: string; headers: Headers }[] = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return String(input).startsWith("https://api.github.com") ? Response.json({ sha: "a".repeat(40) }) : new Response(source);
    };
    const repo = publicRepository("https://github.com/example/repository");
    delete process.env.GITHUB_TOKEN;
    await repositoryHead(repo);
    assert.equal(requests.at(-1)?.headers.get("Authorization"), null);
    process.env.GITHUB_TOKEN = "  verification-token  ";
    await repositoryHead(repo);
    assert.equal(requests.at(-1)?.headers.get("Authorization"), "Bearer verification-token");
    await repositorySource(repo, "a".repeat(40), "file.ts");
    assert.equal(requests.at(-1)?.headers.get("Authorization"), null, "Never forward the token to raw downloads.");
    console.log("Review regressions verified: stop dispatch after failure, settle in-flight work, explicit source limit, optional GitHub authentication confined to the API.");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
