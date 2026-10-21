import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isSemanticRole, type SemanticRole } from "../lib/ai/context.ts";
import { explanationGraph } from "../lib/ai/explanation-context.ts";
import type { RepositoryEdge } from "../lib/parser/types.ts";
import { pathReferences } from "../lib/ai/path-references.ts";

export interface RoleCase { path: string; input: string; expected: SemanticRole }
export interface ExplanationCase {
  kind: "file" | "folder"; target: string; input: string;
  paths: string[]; members: string[]; edges: RepositoryEdge[];
  externalSpecifiers: string[];
}
export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
export function explanationCase(value: unknown): ExplanationCase {
  assert(record(value) && (value.kind === "file" || value.kind === "folder") && typeof value.target === "string"
    && typeof value.input === "string" && strings(value.paths) && strings(value.members) && strings(value.externalSpecifiers) && Array.isArray(value.edges), "Invalid explanation case.");
  const paths = value.paths;
  const edges: RepositoryEdge[] = value.edges.map((edge: unknown) => {
    assert(record(edge) && typeof edge.from === "string" && typeof edge.to === "string"
      && (edge.kind === "import" || edge.kind === "re-export" || edge.kind === "dynamic-import"), "Invalid dataset edge.");
    assert(paths.includes(edge.from) && paths.includes(edge.to), "Edge endpoint absent from supplied paths.");
    return { from: edge.from, to: edge.to, kind: edge.kind };
  });
  return { kind: value.kind, target: value.target, input: value.input, paths: value.paths, members: value.members, edges, externalSpecifiers: value.externalSpecifiers };
}
export const caseGraph = (example: ExplanationCase) => explanationGraph(example.edges, example.members);
export function caseReferences(example: ExplanationCase) {
  const input: unknown = JSON.parse(example.input);
  assert(record(input) && Array.isArray(input.sources), "Dataset input lacks sources.");
  return pathReferences(input.sources.map((source: unknown) => {
    assert(record(source) && typeof source.path === "string" && typeof source.source === "string", "Invalid dataset source.");
    return { path: source.path, source: source.source };
  }), example.externalSpecifiers);
}
export async function loadDataset() {
  const text = await readFile(new URL("./dataset.json", import.meta.url), "utf8");
  const value: unknown = JSON.parse(text);
  assert(record(value) && typeof value.commit === "string" && Array.isArray(value.roles) && Array.isArray(value.explanations), "Invalid eval dataset.");
  const roles: RoleCase[] = value.roles.map((item: unknown) => {
    assert(record(item) && typeof item.path === "string" && typeof item.input === "string" && isSemanticRole(item.expected), "Invalid held out role.");
    const input: unknown = JSON.parse(item.input);
    assert(record(input) && record(input.file) && !("role" in input.file), "Held out role leaked into input.");
    return { path: item.path, input: item.input, expected: item.expected };
  });
  assert(roles.length >= 30 && new Set(roles.map((item) => item.path)).size === roles.length, "Role dataset needs at least thirty distinct files.");
  const explanations = value.explanations.map(explanationCase);
  assert(explanations.length > 0, "Explanation dataset is empty.");
  return { roles, explanations, commit: value.commit, text };
}
