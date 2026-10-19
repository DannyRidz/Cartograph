import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types.ts";
import { parseRepository } from "../lib/parser/parse.ts";
import { readStoredRepository } from "../lib/stored-repository.ts";

const directory = await mkdtemp(path.join(tmpdir(), "cartograph-stored-map-"));
try {
  // Parse real imports across more than one API page, including all edge kinds.
  await Promise.all(Array.from({ length: 503 }, (_, index) => writeFile(path.join(directory, `file-${index}.ts`), [
    "export const value = 1;",
    ...(index < 502 ? [`import { value as next } from './file-${index + 1}';`] : []),
    ...(index === 0 ? ["export { value as reexport } from './file-1';", "import('./file-1');", "import './missing';"] : []),
  ].join("\n"))));
  const original = await parseRepository(directory);
  const ids = new Map(original.files.map((file, index) => [file.path, `file-id-${index}`]));
  const files = original.files.map((file) => ({ id: ids.get(file.path), path: file.path, folder: file.folder,
    module: file.module, kind: file.kind, line_count: file.lineCount, hash: file.hash, fan_in: file.fanIn, fan_out: file.fanOut }));
  const edges = original.edges.map((edge, index) => ({ id: `edge-id-${index}`, source_file_id: ids.get(edge.from), target_file_id: ids.get(edge.to), kind: edge.kind }));
  const roles = original.files.map((file, index) => ({ id: `role-id-${index}`, file_id: ids.get(file.path), role: file.role }));
  const routes = (original.routes ?? []).map((route, index) => ({ id: `route-id-${index}`, file_id: ids.get(route.file), method: route.method, path: route.path }));
  const calls: string[] = [];
  let mode: "normal" | "missing-endpoint" | "truncated" | "denied" = "normal";
  const database = createClient<Database>("https://stored-map.example", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert.equal(url.searchParams.get("analysis_id"), "eq.analysis-id");
      assert.equal(url.searchParams.has("organization_id"), false);
      assert.notEqual(url.searchParams.get("select"), "*");
      assert.equal(url.searchParams.get("order"), "id.asc");
      const table = url.pathname.split("/").at(-1);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit"));
      calls.push(`${table}:${offset}`);
      assert.equal(limit, 500);
      if (mode === "denied") return Response.json({ message: "permission denied" }, { status: 403 });
      const rows = table === "files" ? files : table === "edges" ? edges : table === "file_roles" ? roles : routes;
      const page = rows.slice(offset, offset + limit);
      if (mode === "truncated") page.pop();
      if (mode === "missing-endpoint" && table === "files" && offset === 0) page[0] = { ...files[0], id: "missing" };
      return Response.json(page, { headers: { "content-range": `${offset}-${offset + page.length - 1}/${rows.length}` } });
    } },
  });
  const analysis = { schema_version: original.schemaVersion, adapter: original.adapter, coverage: original.coverage };
  const restored = await readStoredRepository(database, "analysis-id", analysis);
  assert.deepEqual(restored, original, "Stored map changed the parser result");
  assert.deepEqual(calls.sort(), ["edges:0", "edges:500", "file_roles:0", "file_roles:500", "files:0", "files:500", "routes:0"]);
  assert.deepEqual(new Set(restored.edges.map((edge) => edge.kind)), new Set(["import", "re-export", "dynamic-import"]));
  assert.equal(restored.coverage.totals.unresolved, 1);
  mode = "missing-endpoint";
  await assert.rejects(readStoredRepository(database, "analysis-id", analysis), /missing file/);
  mode = "truncated";
  await assert.rejects(readStoredRepository(database, "analysis-id", analysis), /incomplete data/);
  mode = "denied";
  await assert.rejects(readStoredRepository(database, "analysis-id", analysis), /Could not load/);
  mode = "normal";
  await assert.rejects(readStoredRepository(database, "analysis-id", { ...analysis, schema_version: 99 }), /unsupported schema/);
  console.log("Stored map: exact parser round trip across API pages, all import kinds, partial coverage and rejected missing, truncated or inaccessible data passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
