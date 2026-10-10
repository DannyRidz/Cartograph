import { parseRepository } from "../lib/parser/parse.ts";
import { readRepositoryResult, writeRepositoryResult } from "../lib/parser/data.ts";

async function main(): Promise<void> {
  const [directory, flag, output, ...extra] = process.argv.slice(2);
  if (!directory || (flag !== undefined && (flag !== "--output" || !output)) || extra.length) {
    throw new Error("Usage: pnpm parse <directory> [--output <result.json>]");
  }
  const result = await parseRepository(directory);
  const coverage = result.coverage;
  console.log(`Files found: ${coverage.filesFound}, parsed: ${coverage.filesParsed}, skipped: ${coverage.filesSkipped}`);
  console.log(`Folders: ${coverage.folders}, edges: ${result.edges.length}`);
  console.log(`Imports: ${coverage.imports.length}, resolved: ${coverage.totals.resolved}, external: ${coverage.totals.external}, excluded: ${coverage.totals.excluded}, unresolved: ${coverage.totals.unresolved}`);
  const exports = coverage.imports.filter((entry) => entry.kind === "re-export");
  console.log(`Re-exports found: ${exports.length}, resolved: ${exports.filter((entry) => entry.status === "resolved").length}`);
  for (const entry of coverage.skipped) console.log(`Skipped ${entry.path}: ${entry.reason}`);
  for (const entry of coverage.excludedDirectories) console.log(`Excluded directory ${entry.path}: ${entry.reason}`);
  for (const entry of coverage.imports) {
    if (entry.status === "unresolved" || entry.status === "excluded" || (entry.kind === "re-export" && entry.status !== "resolved")) {
      console.log(`${entry.status} ${entry.file}:${entry.line} ${entry.specifier ?? "<nonliteral>"}: ${entry.reason}`);
    }
  }
  if (output) {
    await writeRepositoryResult(output, result);
    const restored = await readRepositoryResult(output);
    if (JSON.stringify(restored) !== JSON.stringify(result)) throw new Error("Output round trip changed repository data");
    console.log(`Wrote and validated schema version ${restored.schemaVersion}: ${output}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
