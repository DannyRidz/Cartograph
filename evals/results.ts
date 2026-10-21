import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ExperimentResultRow } from "langsmith/evaluation";
import type { Client } from "langsmith";
import { record } from "./dataset.ts";

export interface ExperimentReport {
  name: string;
  count: number;
  datasetId: string;
  means: Record<string, number>;
  runs: { id: string; scores: Record<string, number> }[];
}

function validateReport(report: ExperimentReport) {
  const keys = Object.keys(report.means);
  assert(Number.isInteger(report.count) && report.count > 0 && report.runs.length === report.count && keys.length > 0, "Incomplete experiment report.");
  assert(new Set(report.runs.map((run) => run.id)).size === report.count, "Duplicate saved run IDs.");
  for (const key of keys) {
    const scores = report.runs.map((run) => run.scores[key]);
    assert(scores.every((score) => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1), "Invalid saved scores.");
    assert(Math.abs(scores.reduce((sum, score) => sum + score, 0) / report.count - report.means[key]) < 1e-9, "Saved mean disagrees with saved row scores.");
  }
}

export function experimentReport(name: string, rows: ExperimentResultRow[], count: number, keys: string[]): ExperimentReport {
  assert(count > 0 && rows.length === count, "Experiment did not produce every expected result.");
  const datasetId = rows[0].example.dataset_id;
  const runs = rows.map((row) => {
    assert(!row.run.error, `Experiment run failed: ${row.run.error}`);
    assert(row.example.dataset_id === datasetId, "Experiment mixed datasets.");
    const scores: Record<string, number> = {};
    for (const key of keys) {
      const matches = row.evaluationResults.results.filter((item) => item.key === key);
      assert(matches.length === 1 && typeof matches[0].score === "number" && Number.isFinite(matches[0].score), `Missing or duplicate ${key} score on ${row.run.id}.`);
      scores[key] = matches[0].score;
    }
    return { id: row.run.id, scores };
  });
  assert(new Set(runs.map((run) => run.id)).size === count, "Duplicate experiment runs.");
  const means = Object.fromEntries(keys.map((key) => [key, runs.reduce((sum, run) => sum + run.scores[key], 0) / count]));
  return { name, count, datasetId, means, runs };
}

/** Counts matter: an equal mean over five of six rows is still incomplete. */
export function aggregateDifferences(report: ExperimentReport, stats: unknown): string[] {
  if (!record(stats)) return ["No aggregate feedback is available yet."];
  const differences: string[] = [];
  for (const [key, expected] of Object.entries(report.means)) {
    const actual: unknown = stats[key];
    if (!record(actual) || actual.n !== report.count || typeof actual.avg !== "number"
      || !Number.isFinite(actual.avg) || Math.abs(actual.avg - expected) > 1e-9) {
      differences.push(`${key}: expected ${report.count} scores averaging ${expected}; got ${JSON.stringify(actual)}`);
    }
  }
  return differences;
}

export function comparisonUrl(datasetUrl: string, ids: string[]) {
  assert(ids.length > 0 && ids.every((id) => /^[a-f\d-]{36}$/i.test(id)), "Invalid experiment IDs.");
  const url = new URL(datasetUrl.replace(/\/$/, "") + "/compare");
  url.searchParams.set("selectedSessions", ids.join(","));
  return url.toString();
}

export async function verifyExperiment(client: Client, report: ExperimentReport) {
  validateReport(report);
  await client.awaitPendingTraceBatches();
  const initial = await client.readProject({ projectName: report.name });
  const delays = [0, 1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000];
  let pending = "";
  for (const [attempt, delay] of delays.entries()) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const project = await client.readProject({ projectId: initial.id, includeStats: true });
    const runs = [];
    for await (const run of client.listRuns({ projectId: initial.id, isRoot: true, limit: report.count + 1 })) runs.push(run);
    const differences = aggregateDifferences(report, project.feedback_stats);
    if (runs.length !== report.count) differences.push(`Expected ${report.count} persisted runs, found ${runs.length}.`);
    for (const expected of report.runs) {
      const actual = runs.find((run) => run.id === expected.id);
      if (!actual || actual.error) { differences.push(`Missing or failed run ${expected.id}.`); continue; }
      const stats: unknown = actual.feedback_stats;
      for (const [key, score] of Object.entries(expected.scores)) {
        const stat: unknown = record(stats) ? stats[key] : undefined;
        if (!record(stat) || stat.n !== 1 || stat.avg !== score) differences.push(`Run ${expected.id} has missing or mismatched ${key} feedback.`);
      }
    }
    if (!differences.length) return project;
    pending = differences.join("\n");
    if (attempt < delays.length - 1) console.log(`${report.name}: awaiting complete LangSmith feedback and aggregates (${attempt + 1}/${delays.length}).`);
  }
  throw new Error(`LangSmith results are not fully reconciled for ${report.name}. No completion is claimed. Run pnpm eval:results to recheck without model calls or new experiments.\n${pending}`);
}

export async function saveReports(kind: "roles" | "prompts", reports: ExperimentReport[]) {
  const directory = new URL("./.cache/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${kind}-report.json`, directory), JSON.stringify(reports, null, 2) + "\n");
}

export async function verifySavedResults(client: Client) {
  let count = 0;
  for (const kind of ["roles", "prompts"]) {
    let value: unknown;
    try { value = JSON.parse(await readFile(new URL(`./.cache/${kind}-report.json`, import.meta.url), "utf8")); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    assert(Array.isArray(value) && value.length > 0, "Invalid saved experiment report.");
    const reports: ExperimentReport[] = [];
    const projects = [];
    for (const report of value) {
      assert(record(report) && typeof report.name === "string" && typeof report.count === "number" && report.count > 0
        && typeof report.datasetId === "string" && record(report.means) && Array.isArray(report.runs), "Invalid saved report.");
      const means: Record<string, number> = {};
      for (const [key, score] of Object.entries(report.means)) { assert(typeof score === "number" && Number.isFinite(score)); means[key] = score; }
      const runs = report.runs.map((run: unknown) => {
        assert(record(run) && typeof run.id === "string" && record(run.scores), "Invalid saved run.");
        const scores: Record<string, number> = {};
        for (const [key, score] of Object.entries(run.scores)) { assert(typeof score === "number" && Number.isFinite(score)); scores[key] = score; }
        return { id: run.id, scores };
      });
      const normalized = { name: report.name, count: report.count, datasetId: report.datasetId, means, runs };
      const verified = await verifyExperiment(client, normalized);
      reports.push(normalized);
      projects.push(verified);
      count++;
      console.log(`${verified.name}: all ${report.count} stored rows and dashboard aggregates agree. ${JSON.stringify(means)}`);
    }
    if (kind === "prompts" && reports.length === 2) {
      console.log(`Current minus retired: ${((reports[1].means.usefulness_judge - reports[0].means.usefulness_judge) * 100).toFixed(2)} percentage points of subjective usefulness.`);
      console.log(`Verified comparison: ${comparisonUrl(await client.getDatasetUrl({ datasetId: reports[0].datasetId }), projects.map((project) => project.id))}`);
    }
  }
  assert(count > 0, "No saved results. Run pnpm eval:roles and pnpm eval:prompts first.");
}
