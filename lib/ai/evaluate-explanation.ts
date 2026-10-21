import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { traceClient, tracingConfigured } from "./client.ts";
import { inventedPaths } from "./invented-paths.ts";
import type { PathReferences } from "./path-references.ts";

export async function evaluatedExplanation<T extends { body: string }>(paths: string[], generate: () => Promise<T>, references?: () => PathReferences) {
  let runId: string | undefined;
  const run = traceable(async (request: { paths: string[] }) => {
    if (tracingConfigured()) runId = getCurrentRunTree().id;
    const result = await generate();
    const pathReferences = references?.() ?? { externalSpecifiers: [], codeSymbols: [] };
    return { ...result, pathReferences, pathEvaluation: inventedPaths(result.body, request.paths, pathReferences) };
  }, { name: "cartograph.explanation", run_type: "chain", client: traceClient(),
    tracingEnabled: tracingConfigured(), project_name: process.env.LANGSMITH_PROJECT ?? "Cartograph" });
  const result = await run({ paths });
  if (runId) {
    try {
      await traceClient().awaitPendingTraceBatches();
      const project = await traceClient().readProject({ projectName: process.env.LANGSMITH_PROJECT ?? "Cartograph" });
      await traceClient().createFeedback({ runId, sessionId: project.id, key: result.pathEvaluation.key,
        score: result.pathEvaluation.score, comment: result.pathEvaluation.comment, feedbackSourceType: "api" });
    } catch (error) {
      console.error("Live invented-path feedback could not be uploaded to LangSmith.", error);
    }
  }
  return result;
}
