import assert from "node:assert/strict";
import { isProgressMessage, isStale, mergeProgress, progressSnapshot, staleAfterMs, type ProgressSnapshot } from "../lib/analysis-progress.ts";

const start: ProgressSnapshot = { id: "verification", stage: "fetch", message: "Fetching.", updatedAt: "2026-10-19T00:00:00.000Z" };
const now = Date.parse(start.updatedAt);
assert(!isStale(start, now + staleAfterMs));
assert(isStale(start, now + staleAfterMs + 1));
assert(!isStale({ ...start, stage: "completed" }, now + staleAfterMs * 2));
assert(!isStale({ ...start, stage: "failed" }, now + staleAfterMs * 2));
assert(isProgressMessage({ stage: "parse", message: "Parsing imports." }));
assert(!isProgressMessage({ stage: "invented", message: "Unknown stage" }));
assert(!isProgressMessage({ stage: "fetch", message: 5 }));
assert(!isProgressMessage(null));
const parsing = { ...start, stage: "parse" as const, message: "Parsing imports." };
const completed = { ...start, stage: "completed" as const, message: "Analysis complete." };
assert.equal(mergeProgress(parsing, start), parsing);
assert.equal(mergeProgress(start, parsing), parsing);
assert.equal(mergeProgress(completed, parsing), completed);
assert.equal(mergeProgress(completed, { ...start, stage: "failed" }), completed);
const failed = progressSnapshot({ id: "verification", stage: "failed", state: "failed", stage_message: "Invalid configuration.",
  failed_stage: "parse", failure_message: "Invalid configuration.", updated_at: start.updatedAt, is_seed: false });
assert.equal(failed.message, "Failed during parse: Invalid configuration.");
assert.equal(failed.stage, "failed");
assert.equal(progressSnapshot({ id: "seed", state: "completed", stage: "queued", stage_message: "Waiting.",
  failed_stage: null, failure_message: null, updated_at: start.updatedAt, is_seed: true }).stage, "completed");
console.log("Progress verified: payload validation, stale timing, terminal states, failure details and protection against late stage regressions.");
