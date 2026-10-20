import { detectRepositoryAdapter } from "../adapters/detect.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PipelineStage } from "../database.types.ts";
import { parseRepository } from "../parser/parse.ts";
import { validateRepositoryResult } from "../parser/data.ts";
import { fetchArchive, selectArchive } from "./archive.ts";
import { publicRepository, type PublicRepository } from "./repository.ts";
import { classifyFiles } from "../ai/classify.ts";

export async function beginAnalysis(database: SupabaseClient<Database>, url: string, reanalyse = false) {
  const repository = publicRepository(url);
  const { data, error } = await database.rpc("begin_analysis", { p_repository_url: repository.url, p_reanalyse: reanalyse });
  if (error) throw new Error(`Could not start the analysis: ${error.message}`, { cause: error });
  if (data?.length !== 1) throw new Error("Starting an analysis did not return exactly one row.");
  return { id: data[0].analysis_id, created: data[0].created, repository };
}

export async function runAnalysis(database: SupabaseClient<Database>, id: string, repository: PublicRepository) {
  let stage: PipelineStage = "fetch";
  let temporary: string | undefined;
  async function advance(next: PipelineStage, message: string, commit?: string) {
    const { error } = await database.rpc("advance_analysis", {
      p_analysis_id: id, p_expected_stage: stage, p_stage: next, p_message: message,
      ...(commit ? { p_commit_sha: commit } : {}),
    });
    if (error) throw new Error(`Could not record ${next}: ${error.message}`, { cause: error });
    stage = next;
  }
  try {
    const { commit, archive } = await fetchArchive(repository);
    await advance("select", "Selecting the repository files from the archive.", commit);
    temporary = await mkdtemp(path.join(tmpdir(), "cartograph-run-"));
    const root = await selectArchive(archive, temporary);
    await advance("parse", "Parsing TypeScript and JavaScript imports.");
    const parsed = await parseRepository(root, await detectRepositoryAdapter(root));
    const result = await classifyFiles(database, root, parsed);
    validateRepositoryResult(result);
    await advance("store", `Storing ${result.files.length} files and ${result.edges.length} resolved import edges.`);
    // Removing the archive before committing completion keeps cleanup failures
    // inside the same failure path as the rest of the run.
    await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
    const { error } = await database.rpc("store_analysis", { p_analysis_id: id, p_result: result });
    if (error) throw new Error(`Could not store parser output: ${error.message}`, { cause: error });
    return { id, state: "completed" as const, commit, files: result.files.length, edges: result.edges.length };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const { error: failureError } = await database.rpc("fail_analysis", { p_analysis_id: id, p_stage: stage, p_message: message });
    if (failureError) {
      throw new AggregateError([error, failureError], `Analysis failed in ${stage}; its failed state could not be stored: ${failureError.message}`);
    }
    return { id, state: "failed" as const, failedStage: stage, message };
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
