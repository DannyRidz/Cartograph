import "server-only";
import { createDatabaseClient } from "@/lib/supabase";

export async function listAnalyses() {
  const database = await createDatabaseClient();
  // RLS supplies ownership. The same query runs for every active organization.
  const { data, error } = await database
    .from("analyses")
    .select("id, state, is_seed, created_at, projects!analyses_organization_id_project_id_fkey(repository_url)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  if (error) throw new Error("The analyses query failed.", { cause: error });
  return data;
}
