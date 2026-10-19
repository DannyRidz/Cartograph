import "server-only";
import { createDatabaseClient } from "@/lib/supabase";

export async function listAnalyses() {
  const database = await createDatabaseClient();
  // RLS supplies ownership. The same query runs for every active organization.
  const { data, error } = await database
    .from("analyses")
    .select("id, state, stage, stage_message, failed_stage, failure_message, updated_at, is_seed, created_at, projects!analyses_organization_id_project_id_fkey(repository_url)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  if (error) throw new Error("The analyses query failed.", { cause: error });
  return data;
}

export async function getAnalysis(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return null;
  const database = await createDatabaseClient();
  const { data, error } = await database.from("analyses")
    .select("id, state, stage, stage_message, failed_stage, failure_message, updated_at, is_seed, created_at, commit_sha, coverage, projects!analyses_organization_id_project_id_fkey(repository_url)")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("The analysis query failed.", { cause: error });
  return data ? { ...data, evaluatedAt: Date.now() } : null;
}

export async function getDashboardSnapshot() {
  const analyses = await listAnalyses();
  return { analyses, evaluatedAt: Date.now() };
}
