import type { RepositoryResult } from "@/lib/parser/types";

export function CoverageBanner({ coverage }: { coverage: RepositoryResult["coverage"] }) {
  const { resolved, excluded, unresolved, external } = coverage.totals;
  const local = resolved + excluded + unresolved;
  const percent = (count: number, total: number) => `${Math.floor(count / total * 100)}%`;
  const partial = coverage.filesSkipped > 0 || excluded > 0 || unresolved > 0;
  return <details className="coverage-banner" open={partial}>
    <summary>
      <strong>{partial ? "Partial graph" : coverage.filesParsed === 0 ? "No source files parsed" : "Parser coverage"}</strong>
      {" · "}{coverage.filesParsed}/{coverage.filesFound} source files parsed{coverage.filesFound > 0 && ` (${percent(coverage.filesParsed, coverage.filesFound)})`}
      {" · "}{local > 0 ? `${resolved}/${local} local imports resolved (${percent(resolved, local)})` : "No local imports found"}
    </summary>
    <p>{coverage.filesSkipped} skipped files · {unresolved} unresolved imports · {excluded} excluded imports · {external} external imports. External packages are outside this repository map.</p>
    {coverage.skipped.length > 0 && <ul>{coverage.skipped.map((file) => <li key={file.path}><code>{file.path}</code>: {file.reason}</li>)}</ul>}
    {coverage.imports.some((entry) => entry.status === "unresolved" || entry.status === "excluded") && <ul>{coverage.imports.filter((entry) => entry.status === "unresolved" || entry.status === "excluded").map((entry, index) => <li key={index}><code>{entry.file}:{entry.line}</code>{" · "}<code>{entry.specifier}</code>: {entry.reason}</li>)}</ul>}
  </details>;
}
