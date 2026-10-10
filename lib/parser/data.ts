import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { calculateFanCounts, deduplicateEdges } from "./graph.ts";
import type { ImportKind, ImportOutcome, RepositoryEdge, RepositoryFile, RepositoryResult, SkippedFile } from "./types.ts";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function kind(value: unknown): value is ImportKind {
  return value === "import" || value === "re-export" || value === "dynamic-import";
}
function file(value: unknown): value is RepositoryFile {
  return object(value) && typeof value.path === "string" && typeof value.folder === "string"
    && typeof value.module === "string" && (value.kind === "module" || value.kind === "script")
    && count(value.lineCount) && typeof value.hash === "string" && /^[a-f0-9]{64}$/.test(value.hash)
    && count(value.fanIn) && count(value.fanOut);
}
function edge(value: unknown): value is RepositoryEdge {
  return object(value) && typeof value.from === "string" && typeof value.to === "string" && kind(value.kind);
}
function skip(value: unknown): value is SkippedFile {
  return object(value) && typeof value.path === "string" && typeof value.reason === "string";
}
function outcome(value: unknown): value is ImportOutcome {
  return object(value) && typeof value.file === "string" && count(value.line) && value.line > 0
    && kind(value.kind) && (typeof value.specifier === "string" || value.specifier === null)
    && (value.status === "resolved" || value.status === "external" || value.status === "excluded" || value.status === "unresolved")
    && (typeof value.target === "string" || value.target === null)
    && (typeof value.reason === "string" || value.reason === null);
}
function result(value: unknown): value is RepositoryResult {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.adapter !== "string"
    || !Array.isArray(value.files) || !value.files.every(file)
    || !Array.isArray(value.edges) || !value.edges.every(edge) || !object(value.coverage)) return false;
  const coverage = value.coverage;
  return count(coverage.filesFound) && count(coverage.filesParsed) && count(coverage.filesSkipped)
    && count(coverage.folders) && Array.isArray(coverage.skipped) && coverage.skipped.every(skip)
    && Array.isArray(coverage.excludedDirectories) && coverage.excludedDirectories.every(skip)
    && Array.isArray(coverage.imports) && coverage.imports.every(outcome)
    && object(coverage.totals) && ["resolved", "external", "excluded", "unresolved"].every((key) => object(coverage.totals) && count(coverage.totals[key]));
}

export function validateRepositoryResult(value: unknown): asserts value is RepositoryResult {
  if (!result(value)) throw new Error("Invalid repository data or unsupported schema version");
  const coverage = value.coverage;
  const paths = new Set(value.files.map((file) => file.path));
  for (const file of value.files) {
    if (!file.path || path.posix.isAbsolute(file.path) || file.path.includes("\\")
      || file.path.split("/").some((part) => part === ".." || part === "." || part === "")
      || file.folder !== path.posix.dirname(file.path)) throw new Error("Invalid repository file or folder path");
  }
  const totals = { resolved: 0, external: 0, excluded: 0, unresolved: 0 };
  for (const entry of coverage.imports) {
    if (!paths.has(entry.file) || (entry.status === "resolved" && (entry.target === null || !paths.has(entry.target)))
      || (entry.status !== "resolved" && !entry.reason)) throw new Error("Invalid import coverage");
    totals[entry.status]++;
  }
  if (paths.size !== value.files.length || coverage.filesFound !== coverage.filesParsed + coverage.filesSkipped
    || coverage.filesParsed !== value.files.length || coverage.filesSkipped !== coverage.skipped.length
    || coverage.folders !== new Set(value.files.map((file) => file.folder)).size
    || Object.keys(totals).some((key) => Reflect.get(totals, key) !== Reflect.get(coverage.totals, key))
    || deduplicateEdges(value.edges).length !== value.edges.length) throw new Error("Repository counts do not match data");
  const expected = calculateFanCounts(value.files, value.edges);
  for (let index = 0; index < expected.length; index++) {
    if (expected[index].fanIn !== value.files[index].fanIn || expected[index].fanOut !== value.files[index].fanOut)
      throw new Error("Repository fan counts do not match edges");
  }
  const fromImports = deduplicateEdges(coverage.imports.flatMap((entry) =>
    entry.status === "resolved" && entry.target !== null ? [{ from: entry.file, to: entry.target, kind: entry.kind }] : []));
  if (JSON.stringify(fromImports) !== JSON.stringify(deduplicateEdges(value.edges)))
    throw new Error("Repository edges do not match resolved imports");
}

export async function writeRepositoryResult(filename: string, value: RepositoryResult): Promise<void> {
  validateRepositoryResult(value);
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readRepositoryResult(filename: string): Promise<RepositoryResult> {
  const value: unknown = JSON.parse(await readFile(filename, "utf8"));
  validateRepositoryResult(value);
  return value;
}
