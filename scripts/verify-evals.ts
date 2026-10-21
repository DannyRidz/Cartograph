import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { inventedPaths } from "../lib/ai/invented-paths.ts";
import { caseGraph, loadDataset, record } from "../evals/dataset.ts";
import { contentHash } from "../lib/ai/cache.ts";
import { evaluatedExplanation } from "../lib/ai/evaluate-explanation.ts";
import { flushTraces } from "../lib/ai/client.ts";
import { pathReferences } from "../lib/ai/path-references.ts";
import { aggregateDifferences, comparisonUrl, type ExperimentReport } from "../evals/results.ts";
import { generateExplanation, type ExplanationRequest } from "../lib/ai/generate-explanation.ts";

const supplied = ["src/app/[slug]/page.tsx", "index.d.ts", ".env.local", "assets/logo.svg", "config", "folder with space/file.ts"];
const check = inventedPaths("Describes `src/app/[slug]/page.tsx`, index.d.ts, '.env.local' and assets/logo.svg. The identifier `value` is local.", supplied);
assert.equal(check.score, 1);
assert.deepEqual(check.mentioned, [".env.local", "assets/logo.svg", "index.d.ts", "src/app/[slug]/page.tsx"]);
for (const path of ["made-up.ts", "nested/made-up.ts", "page.tsx", "./index.d.ts", "SRC/app/[slug]/page.tsx", "missing/readme.md", "missing/config", "missing/"]) {
  const result = inventedPaths(`Describes \`${path}\`.`, supplied);
  assert.equal(result.score, 0, path);
  assert.deepEqual(result.invented, [path]);
}
assert.equal(inventedPaths("Defines a value with no filenames.", supplied).score, 1);
assert.equal(inventedPaths("`folder with space/file.ts`", supplied).score, 1);
assert.equal(inventedPaths("`folder/a file.ts`", ["folder/a file.ts"]).score, 1);
assert.equal(inventedPaths("(src/app/[slug]/page.tsx).", supplied).score, 1);
assert.deepEqual(inventedPaths("(fabricated.ts).", supplied).invented, ["fabricated.ts"]);
assert.deepEqual(inventedPaths("`src/app/[slug]/page.tsx` and `fabricated.ts`", supplied).invented, ["fabricated.ts"]);
const references = pathReferences([{ path: "example.tsx", source: `
import { AppProps } from 'next/app';
import { QueryClient } from '@tanstack/query-core';
import { internal } from '@/internal.ts';
import { alias } from '@project/internal.ts';
import { lint } from '@tanstack/eslint-config';
const plainString = 'fabricated.ts';
const x = QueryClientContext.Provider;
client.mount();
const view = <QueryClientContext.Provider />;
` }], ["next/app", "@tanstack/query-core"]);
assert(references.codeSymbols.includes("QueryClientContext.Provider"));
assert(references.codeSymbols.includes("client.mount"));
assert(!references.codeSymbols.includes("fabricated.ts"));
assert(!references.externalSpecifiers.includes("@/internal.ts"));
assert(!references.externalSpecifiers.includes("@project/internal.ts"));
assert(references.moduleSpecifiers?.includes("@tanstack/eslint-config"));
for (const prose of ["A Next.js application with serialization/deserialization.",
  "This file defines a value. The folder contains configuration modules.",
  "Defines a `QueryClientContext.Provider` and `client.mount`.",
  "Imports `@tanstack/query-core` and `next/app`.",
  "Imports `@tanstack/eslint-config`.",
  "A React/Next.js provider with input/output conversion.",
  "Supports `.ts` and `.tsx` source files.",
  "It uses React's context API to share a stream and an identifier across the component tree. It integrates with Next.js's streaming facilities.",
  "See https://example.com/guide.ts for details."]) {
  assert.equal(inventedPaths(prose, [], references).score, 1, prose);
}
for (const claim of ["File `Next.js`", "Path `next/app`", "File `client.mount`", "File `.ts`", "`./Next.js`", "`fabricated.ts`", "`fabricated.TS`", "`src/Next.js`", "`made-up.custom`", "`missing/config`", "`@invented/missing.ts`", "`@/internal.ts`", "`@project/internal.ts`"]) {
  assert.equal(inventedPaths(claim, [], references).score, 0, claim);
}
assert.equal(inventedPaths("`Next.js`", ["Next.js"], references).mentioned.length, 1);
assert.deepEqual(inventedPaths("[fabricated.ts](https://example.com)", []).invented, ["fabricated.ts"]);
assert.equal(inventedPaths("[index.d.ts](https://example.com)", supplied).score, 1);
assert.deepEqual(inventedPaths("Targets `src/*.ts` and `src/*.tsx`.", []).invented, ["src/*.ts", "src/*.tsx"]);
assert.deepEqual(inventedPaths("Targets src/*.{ts,tsx}.", []).invented, ["src/*.{ts,tsx}"]);
assert.deepEqual(inventedPaths('Mentions "fabricated.ts, other.ts".', []).invented, ["fabricated.ts", "other.ts"]);
assert.equal(inventedPaths(JSON.stringify({ overview: "Describes a Next.js application." }), []).score, 1);
assert.deepEqual(inventedPaths(JSON.stringify({ overview: "Describes fabricated.ts and other.ts." }), []).invented, ["fabricated.ts", "other.ts"]);
assert(inventedPaths(JSON.stringify({ overview: "Defines a value.", members: [{ path: "a.ts", summary: "Defines a value.", extra: "fabricated.ts" }] }), ["a.ts"]).invented.includes("fabricated.ts"));
const syntaxReferences = pathReferences([{ path: "types.ts", source: `
type Result = import('type-only/pkg').Result;
export { value } from 'exported/pkg';
const lazy = import('lazy/pkg');
const required = require('required/pkg');
` }, { path: "view.jsx", source: "export const view = <Context.Provider />;" }]);
assert.equal(inventedPaths("`type-only/pkg`, `exported/pkg`, `lazy/pkg`, `required/pkg`, `Context.Provider`", [], syntaxReferences).score, 1);
const report: ExperimentReport = { name: "regression", datasetId: "fixture", count: 6,
  means: { usefulness_judge: 2 / 6 }, runs: [] };
assert.deepEqual(aggregateDifferences(report, { usefulness_judge: { n: 6, avg: 2 / 6 } }), []);
assert(aggregateDifferences(report, { usefulness_judge: { n: 5, avg: 0.2 } }).length > 0);
assert(aggregateDifferences(report, { usefulness_judge: { n: 5, avg: 2 / 6 } }).length > 0, "An equal partial average is still incomplete.");
assert(aggregateDifferences(report, { usefulness_judge: { n: 6, avg: NaN } }).length > 0);
assert(aggregateDifferences(report, {}).length > 0);
const comparisonIds = ["acda2041-e02c-4738-9f41-ba8b2330e52e", "0546504f-cb1e-48e2-b64b-81f7987f77b3"];
const url = new URL(comparisonUrl("https://smith.langchain.com/o/workspace/datasets/dataset", comparisonIds));
assert.deepEqual(url.searchParams.getAll("selectedSessions"), [comparisonIds.join(",")], "Both experiments need a single comma separated parameter.");
const request: ExplanationRequest = { kind: "file", input: "original source facts", members: ["a.ts"], paths: ["a.ts"],
  graph: { internal: [], incoming: [], outgoing: [] } };
for (const invalid of ["not JSON", '{"overview":"Uses a helper service."}', '{"overview":"Implements missing.ts."}']) {
  let calls = 0;
  const corrected = await generateExplanation(request, async (messages) => {
    calls++;
    assert.equal(messages[1].content, request.input, "Correction must retain exactly the original source facts.");
    if (calls === 1) { assert.equal(messages.length, 2); return invalid; }
    assert.equal(messages.length, 4);
    assert.equal(messages[2].content, invalid);
    assert.match(messages[3].content, /unchanged production validator/);
    return '{"overview":"Defines a local setting."}';
  });
  assert.equal(corrected.valid, true);
  assert.equal(corrected.attempts, 2);
  assert.equal(calls, 2);
  assert(!corrected.body.includes("missing.ts") && !corrected.body.includes("helper service"));
}
let rejectedCalls = 0;
const rejected = await generateExplanation(request, async () => { rejectedCalls++; return '{"overview":"Uses a helper service."}'; });
assert.equal(rejected.valid, false);
assert.equal(rejectedCalls, 2, "Correction is bounded; unsupported summaries must still fail.");
let transportCalls = 0;
await assert.rejects(generateExplanation(request, async () => { transportCalls++; throw new Error("Model unavailable"); }), /Model unavailable/);
assert.equal(transportCalls, 1, "Transport errors must fail loudly, not become unavailable answers with a score.");
const dataset = await loadDataset();
const counts = new Map<string, number>();
for (const item of dataset.roles) {
  const input: unknown = JSON.parse(item.input);
  assert(record(input) && record(input.file) && typeof input.source === "string" && typeof input.file.hash === "string");
  assert.equal(contentHash(input.source), input.file.hash, item.path);
  assert(!("role" in input.file));
  counts.set(item.expected, (counts.get(item.expected) ?? 0) + 1);
}
assert(new Set(dataset.explanations.map((item) => item.kind)).size === 2, "Compare both files and folders.");
for (const item of dataset.explanations) {
  const input: unknown = JSON.parse(item.input);
  assert(record(input) && Array.isArray(input.sources) && record(input.context));
  const context = input.context;
  const metadata: unknown[] = item.kind === "file" ? [context.file] : Array.isArray(context.members) ? context.members : [];
  const hashes = new Map<string, string>();
  for (const file of metadata) {
    assert(record(file) && typeof file.path === "string" && typeof file.hash === "string");
    hashes.set(file.path, file.hash);
  }
  const sourcePaths = input.sources.map((source: unknown) => {
    assert(record(source) && typeof source.path === "string" && typeof source.source === "string");
    assert.equal(contentHash(source.source), hashes.get(source.path));
    return source.path;
  });
  assert.deepEqual(sourcePaths.sort(), [...item.members].sort());
  assert(item.members.every((path) => item.paths.includes(path)));
  assert.deepEqual(input.graph, caseGraph(item));
}
console.log(`Evals verified: exact path membership and injected failures; ${dataset.roles.length} unique conventional files (${JSON.stringify(Object.fromEntries(counts))}), hidden target roles, source hashes, complete file and folder selections.`);

// Verify the live integration without sending traces or spending model tokens.
process.env.LANGSMITH_TRACING = "true";
process.env.LANGSMITH_API_KEY = "verification-only-key";
const originalFetch = globalThis.fetch;
const feedback: unknown[] = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/sessions")) return Response.json([{ id: "00000000-0000-4000-8000-000000000001", name: "Cartograph" }]);
  if (url.includes("/feedback")) {
    feedback.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "00000000-0000-4000-8000-000000000002" });
  }
  return Response.json({ batch_ingest_config: { use_multipart_endpoint: false } });
};
try {
  for (const cached of [false, true]) {
    const result = await evaluatedExplanation(["src/a.ts"], async () => ({ body: "Describes `src/a.ts`.", cached }));
    assert.equal(result.pathEvaluation.score, 1);
    assert.equal(result.cached, cached);
  }
  const injected = await evaluatedExplanation(["src/a.ts"], async () => ({ body: "Describes `fabricated.ts`." }));
  assert.equal(injected.pathEvaluation.score, 0);
  assert.equal(feedback.length, 3, "Both cache hits and generated explanations must publish feedback.");
  for (const [index, item] of feedback.entries()) {
    assert(record(item) && typeof item.run_id === "string" && item.key === "invented_paths");
    assert.equal(item.score, index === 2 ? 0 : 1);
  }
  console.log("Live evaluator verified: trace feedback for generated explanations, cache hits and invented paths.");
} finally {
  await flushTraces();
  globalThis.fetch = originalFetch;
}

// Exercise the real CLI twice against the same stored trace. Rechecks must
// never add feedback; the request-time evaluator above owns that write.
for (const inject of [false, true]) {
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    let writes = 0;
    let reads = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes('/sessions')) return Response.json([{ id: '00000000-0000-4000-8000-000000000001', name: 'Cartograph' }]);
      if (url.includes('/runs/query')) {
        reads++;
        return Response.json({ runs: [{ id: '00000000-0000-4000-8000-000000000003',
          session_id: '00000000-0000-4000-8000-000000000001', end_time: new Date().toISOString(),
          inputs: { paths: ['src/a.ts'] }, outputs: { body: 'Describes \\x60src/a.ts\\x60.' } }], cursors: {} });
      }
      writes++;
      return Response.json({ id: '00000000-0000-4000-8000-000000000002' });
    };
    process.on('beforeExit', () => {
      assert.equal(reads, 2);
      assert.equal(writes, 0, 'Path rechecks must not write feedback.');
    });
    await import(${JSON.stringify(new URL("./eval-paths.ts?first", import.meta.url).href)});
    await import(${JSON.stringify(new URL("./eval-paths.ts?second", import.meta.url).href)});
  `, ...(inject ? ["--", "--inject"] : [])], {
    encoding: "utf8", timeout: 30_000,
    env: { ...process.env, LANGSMITH_TRACING: "true", LANGSMITH_API_KEY: "verification-only-key" },
  });
  assert.ifError(child.error);
  assert.equal(child.status, inject ? 1 : 0, child.stderr);
  assert(!child.stderr.includes("AssertionError"), child.stderr);
  assert.equal(child.stdout.match(inject ? /Injected path pass rate: 0\.00% \(0\/1\)/g : /Live path pass rate: 100\.00% \(1\/1\)/g)?.length, 2);
}
console.log("Path recheck CLI verified: repeated normal and injected runs never write feedback.");
