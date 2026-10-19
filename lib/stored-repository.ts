import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { validateRepositoryResult } from "./parser/data.ts";

type Analysis = Pick<Database["public"]["Tables"]["analyses"]["Row"], "schema_version" | "adapter" | "coverage">;

// Completed analyses are immutable. Page their rows once, rather than silently
// losing everything beyond the Data API's row limit.
async function readPages<T>(read: (start: number, end: number) => PromiseLike<{
  data: T[] | null; count: number | null; error: unknown;
}>): Promise<T[]> {
  const size = 500;
  const first = await read(0, size - 1);
  if (first.error || !first.data || first.count === null) throw new Error("Could not load the stored map.", { cause: first.error });
  const rows = [...first.data];
  if (rows.length !== Math.min(size, first.count)) throw new Error("The stored map query returned incomplete data.");
  for (let start = size; start < first.count; start += size) {
    const page = await read(start, start + size - 1);
    if (page.error || !page.data) throw new Error("Could not load the stored map.", { cause: page.error });
    if (page.data.length !== Math.min(size, first.count - start)) throw new Error("The stored map query returned incomplete data.");
    rows.push(...page.data);
  }
  return rows;
}

export async function readStoredRepository(database: SupabaseClient<Database>, id: string, analysis: Analysis) {
  // RLS supplies ownership; the ID selects the analysis, never its permissions.
  const [files, edges] = await Promise.all([
    readPages((start, end) => database.from("files")
      .select("id, path, folder, module, kind, line_count, hash, fan_in, fan_out", { count: "exact" })
      .eq("analysis_id", id).order("id").range(start, end)),
    readPages((start, end) => database.from("edges")
      .select("id, source_file_id, target_file_id, kind", { count: "exact" })
      .eq("analysis_id", id).order("id").range(start, end)),
  ]);
  const paths = new Map(files.map((file) => [file.id, file.path]));
  const repository: unknown = {
    schemaVersion: analysis.schema_version,
    adapter: analysis.adapter,
    coverage: analysis.coverage,
    files: files.map((file) => ({ path: file.path, folder: file.folder, module: file.module,
      kind: file.kind, lineCount: file.line_count, hash: file.hash, fanIn: file.fan_in, fanOut: file.fan_out })),
    edges: edges.map((edge) => {
      const from = paths.get(edge.source_file_id);
      const to = paths.get(edge.target_file_id);
      if (from === undefined || to === undefined) throw new Error("A stored dependency refers to a missing file.");
      return { from, to, kind: edge.kind };
    }),
  };
  validateRepositoryResult(repository);
  return repository;
}
