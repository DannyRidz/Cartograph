import type { RepositoryResult, RepositoryFile } from "../parser/types.ts";

export const semanticRoles = ["service", "repository", "model", "util", "config", "component", "hook"] as const;
export type SemanticRole = typeof semanticRoles[number];
export function isSemanticRole(value: unknown): value is SemanticRole {
  return typeof value === "string" && semanticRoles.some((role) => role === value);
}
export function fileContext(repository: RepositoryResult, file: RepositoryFile) {
  const byPath = new Map(repository.files.map((member) => [member.path, member]));
  const describe = (paths: string[]) => [...new Set(paths)].sort().map((path) => {
    const neighbour = byPath.get(path);
    if (!neighbour) throw new Error("A dependency refers to a missing file.");
    return { path, hash: neighbour.hash, role: neighbour.role ?? neighbour.kind };
  });
  return { file, imports: describe(repository.edges.filter((edge) => edge.from === file.path).map((edge) => edge.to)),
    importedBy: describe(repository.edges.filter((edge) => edge.to === file.path).map((edge) => edge.from)) };
}
