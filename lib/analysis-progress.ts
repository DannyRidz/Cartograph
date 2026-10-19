import type { AnalysisState, PipelineStage } from "./database.types";

export type AnalysisStage = PipelineStage | "queued" | "completed" | "failed";
export interface ProgressMessage { stage: AnalysisStage; message: string }
export interface ProgressSnapshot extends ProgressMessage { id: string; updatedAt: string }
export const stageLabels: Record<AnalysisStage, string> = {
  queued: "Queued", fetch: "Fetching", select: "Selecting files", parse: "Parsing", store: "Storing", completed: "Completed", failed: "Failed",
};
export const runStages: PipelineStage[] = ["fetch", "select", "parse", "store"];
export const staleAfterMs = 5 * 60 * 1000;

export function isProgressMessage(value: unknown): value is ProgressMessage {
  return !!value && typeof value === "object" && "stage" in value && typeof value.stage === "string"
    && Object.hasOwn(stageLabels, value.stage) && "message" in value && typeof value.message === "string";
}

export function progressSnapshot(row: { id: string; stage: AnalysisStage; state: AnalysisState; stage_message: string;
  failed_stage: PipelineStage | null; failure_message: string | null; updated_at: string; is_seed: boolean }): ProgressSnapshot {
  const stage = row.is_seed ? row.state === "parsing" ? "parse" : row.state : row.stage;
  return { id: row.id, stage, updatedAt: row.updated_at,
    message: row.state === "failed" && row.failed_stage
      ? `Failed during ${row.failed_stage}: ${row.failure_message ?? row.stage_message}` : row.stage_message };
}

export function isStale(progress: ProgressSnapshot, now: number): boolean {
  return progress.stage !== "completed" && progress.stage !== "failed" && now - Date.parse(progress.updatedAt) > staleAfterMs;
}

export function mergeProgress(previous: ProgressSnapshot, incoming: ProgressSnapshot): ProgressSnapshot {
  if (previous.stage === "completed" || previous.stage === "failed") {
    return incoming.stage === previous.stage ? incoming : previous;
  }
  const order: AnalysisStage[] = ["queued", ...runStages, "completed", "failed"];
  return order.indexOf(incoming.stage) < order.indexOf(previous.stage) ? previous : incoming;
}
