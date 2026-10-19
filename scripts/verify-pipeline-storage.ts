import { spawnSync } from "node:child_process";
import { readRepositoryResult } from "../lib/parser/data.ts";

async function main() {
  const [filename, ...extra] = process.argv.slice(2);
  if (!filename || extra.length) throw new Error("Usage: node --env-file=.env.local scripts/verify-pipeline-storage.ts <parser-result.json>");
  const result = await readRepositoryResult(filename);
  let environment = process.env;
  if (process.env.SUPABASE_DB_URL) {
    const url = new URL(process.env.SUPABASE_DB_URL);
    environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: url.pathname.slice(1), PGSSLMODE: "require" };
  } else if (!process.env.PGHOST || !process.env.PGDATABASE) {
    throw new Error("Set SUPABASE_DB_URL, or PGHOST and PGDATABASE, to the database to verify.");
  }
  const checked = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-v", `parser_result=${JSON.stringify(result)}`,
    "-f", "supabase/verify-pipeline.sql"], { env: environment, stdio: "inherit" });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) throw new Error("Pipeline database verification failed.");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
