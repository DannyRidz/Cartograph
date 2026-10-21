import "./lib/environment.ts";
import { traceClient, tracingConfigured } from "../lib/ai/client.ts";
import { inventedPaths } from "../lib/ai/invented-paths.ts";
import { record } from "../evals/dataset.ts";

async function main() {
  if (!tracingConfigured()) throw new Error("Set LANGSMITH_API_KEY and LANGSMITH_TRACING=true in .env.local.");
  const inject = process.argv.includes("--inject");
  const client = traceClient();
  let count = 0;
  let passed = 0;
  let skipped = 0;
  for await (const run of client.listRuns({ projectName: process.env.LANGSMITH_PROJECT ?? "Cartograph", filter: 'eq(name, "cartograph.explanation")',
    startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), limit: 50, order: "desc" })) {
    const paths: unknown = run.inputs.paths;
    const body: unknown = run.outputs?.body;
    if (run.error || !run.end_time) { skipped++; continue; }
    if (!Array.isArray(paths) || !paths.every((item: unknown) => typeof item === "string") || typeof body !== "string") {
      throw new Error(`Run ${run.id} lacks the exact supplied paths or explanation. No score can be claimed.`);
    }
    let invented = "__cartograph_eval_invented__/not-supplied.ts";
    while (paths.includes(invented)) invented = `_${invented}`;
    const evaluatedBody = inject ? `${body}\nCalls \`${invented}\`.` : body;
    const references: unknown = run.outputs?.pathReferences;
    const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
    if (references !== undefined && (!record(references) || !strings(references.externalSpecifiers) || !strings(references.codeSymbols)
      || (references.moduleSpecifiers !== undefined && !strings(references.moduleSpecifiers)))) {
      throw new Error(`Run ${run.id} has malformed path reference evidence.`);
    }
    const result = inventedPaths(evaluatedBody, paths, record(references) && strings(references.externalSpecifiers) && strings(references.codeSymbols)
      ? { externalSpecifiers: references.externalSpecifiers, codeSymbols: references.codeSymbols,
        moduleSpecifiers: strings(references.moduleSpecifiers) ? references.moduleSpecifiers : [] } : undefined);
    count++;
    passed += result.score;
    if (!result.score) console.log(JSON.stringify({ run: run.id, invented: result.invented, supplied: paths, explanation: evaluatedBody }));
    if (!inject) {
      if (!run.session_id) throw new Error(`Run ${run.id} has no LangSmith project ID.`);
      await client.createFeedback({ runId: run.id, sessionId: run.session_id, key: result.key, score: result.score, comment: result.comment });
    }
  }
  if (!count) throw new Error("No completed phase 11 explanation traces in the last seven days. Explain a real file or folder with tracing enabled, then retry.");
  console.log(`${inject ? "Injected" : "Live"} path pass rate: ${(100 * passed / count).toFixed(2)}% (${passed}/${count}); ${skipped} unfinished/error runs skipped.`);
  if (passed !== count) process.exitCode = 1;
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
