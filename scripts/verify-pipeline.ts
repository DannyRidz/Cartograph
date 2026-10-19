import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types.ts";
import { fetchArchive, selectArchive } from "../lib/pipeline/archive.ts";
import { publicRepository } from "../lib/pipeline/repository.ts";
import { beginAnalysis, runAnalysis } from "../lib/pipeline/run.ts";
import { validateRepositoryResult } from "../lib/parser/data.ts";

function archive(entries: { name: string; body?: string; type?: string; target?: string }[]): Buffer {
  return gzipSync(Buffer.concat([...entries.flatMap((entry) => {
    const body = Buffer.from(entry.body ?? "");
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100);
    header.write("0000644\0", 100);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.fill(32, 148, 156);
    header.write(entry.type ?? "0", 156);
    if (entry.target) header.write(entry.target, 157, 100);
    header.write("ustar\0", 257);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    return [header, body, Buffer.alloc((512 - body.length % 512) % 512)];
  }), Buffer.alloc(1024)]));
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), "cartograph-pipeline-check-"));
  const originalFetch = globalThis.fetch;
  const sha = "a".repeat(40);
  const repository = publicRepository("https://github.com/Owner/Repo.git/");
  assert.equal(repository.url, "https://github.com/owner/repo");
  for (const url of ["http://github.com/a/b", "https://github.com/a/b/tree/main", "https://user@github.com/a/b", "https://github.com/a/b?x=1", "https://example.com/a/b"]) {
    assert.throws(() => publicRepository(url));
  }
  const fixture = archive([
    { name: "repo/packages/app/tsconfig.json", body: '{"compilerOptions":{"paths":{"@/*":["./*"]}}}' },
    { name: "repo/packages/app/main.ts", body: 'import { value } from "@/value"; export { value } from "./value"; import("./value");\n' },
    { name: "repo/packages/app/value.ts", body: "export const value = 1;\n" },
    { name: "repo/README.md", body: "not source\n" },
    { name: "repo/link.ts", type: "2", target: "packages/app/value.ts" },
  ]);
  let downloadUrl = "";
  let networkMode: "ok" | "missing" | "bad-archive" | "bad-config" = "ok";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (networkMode === "missing") return new Response(null, { status: 404 });
    if (url.endsWith("/commits/HEAD")) return Response.json({ sha });
    downloadUrl = url;
    const bytes = networkMode === "bad-archive" ? archive([{ name: "repo/../../escape.ts" }])
      : networkMode === "bad-config" ? archive([
        { name: "repo/tsconfig.json", body: "{broken" },
        { name: "repo/main.ts", body: 'import "./value";' },
      ]) : fixture;
    return new Response(new Uint8Array(bytes));
  };
  try {
    const fetched = await fetchArchive(repository);
    assert.equal(fetched.commit, sha);
    assert(downloadUrl.endsWith(`/tarball/${sha}`));
    const selected = await selectArchive(fetched.archive, path.join(root, "safe"));
    assert.equal(await readFile(path.join(selected, "packages/app/value.ts"), "utf8"), "export const value = 1;\n");
    await assert.rejects(selectArchive(archive([{ name: "repo/../../escape.ts" }]), path.join(root, "traversal")), /unsafe path/);
    await assert.rejects(selectArchive(archive([{ name: "repo/link", type: "2", target: "../../outside" }]), path.join(root, "link")), /outside the repository/);
    await assert.rejects(selectArchive(gzipSync(Buffer.alloc(100)), path.join(root, "truncated")), /incomplete/);

    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let failRpc = "";
    const database = createClient<Database>("https://database.invalid", "publishable-verification-key", {
      accessToken: async () => "verification-session",
      global: { fetch: async (input, init) => {
        const name = String(input).split("/").at(-1) ?? "";
        const args: unknown = JSON.parse(String(init?.body));
        assert(args && typeof args === "object" && !Array.isArray(args));
        calls.push({ name, args: Object.fromEntries(Object.entries(args)) });
        if (name === failRpc) return Response.json({ message: "Deliberate database failure", code: "P0001" }, { status: 400 });
        if (name === "begin_analysis") return Response.json([{ analysis_id: "verification-id", created: true }]);
        return new Response(null, { status: 204 });
      } },
    });
    assert.equal((await beginAnalysis(database, repository.url)).id, "verification-id");
    calls.length = 0;
    const completed = await runAnalysis(database, "verification-id", repository);
    assert.equal(completed.state, "completed");
    assert.deepEqual(calls.map((call) => call.name), ["advance_analysis", "advance_analysis", "advance_analysis", "store_analysis"]);
    assert.deepEqual(calls.filter((call) => call.name === "advance_analysis").map((call) => call.args.p_stage), ["select", "parse", "store"]);
    const stored = calls.at(-1)?.args.p_result;
    validateRepositoryResult(stored);
    assert.equal(stored.files.length, 2);
    assert.equal(stored.edges.length, 3);
    assert.equal(stored.coverage.filesSkipped, 3);
    assert.equal(stored.coverage.totals.resolved, 3);
    assert(stored.coverage.skipped.some((skip) => skip.reason.includes("symbolic link")));
    assert(stored.edges.every((edge) => stored.files.some((file) => file.path === edge.to)));

    calls.length = 0;
    networkMode = "missing";
    assert.equal((await runAnalysis(database, "verification-id", repository)).state, "failed");
    assert.equal(calls.at(-1)?.args.p_stage, "fetch");
    assert.match(String(calls.at(-1)?.args.p_message), /not found/);
    calls.length = 0;
    networkMode = "bad-archive";
    assert.equal((await runAnalysis(database, "verification-id", repository)).state, "failed");
    assert.equal(calls.at(-1)?.args.p_stage, "select");
    networkMode = "bad-config";
    calls.length = 0;
    assert.equal((await runAnalysis(database, "verification-id", repository)).state, "failed");
    assert.equal(calls.at(-1)?.args.p_stage, "parse");
    networkMode = "ok";
    failRpc = "store_analysis";
    calls.length = 0;
    assert.equal((await runAnalysis(database, "verification-id", repository)).state, "failed");
    assert.equal(calls.at(-1)?.args.p_stage, "store");
    networkMode = "missing";
    failRpc = "fail_analysis";
    await assert.rejects(runAnalysis(database, "verification-id", repository), /failed state could not be stored/);
    console.log("Pipeline verified: commit pinning, archive safety, nested aliases, typed edges, coverage, stages and loud failure persistence.");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
