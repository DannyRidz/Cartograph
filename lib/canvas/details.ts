import type { RepositoryEdge, RepositoryFile } from "../parser/types.ts";

export function repositoryDetails(files: RepositoryFile[], edges: RepositoryEdge[]) {
  const incoming = new Map(files.map((file) => [file.path, new Set<string>()]));
  const outgoing = new Map(files.map((file) => [file.path, new Set<string>()]));
  for (const edge of edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) {
      throw new Error(`Missing detail endpoint: ${edge.from} -> ${edge.to}`);
    }
    incoming.get(edge.to)?.add(edge.from);
    outgoing.get(edge.from)?.add(edge.to);
  }
  const details = new Map(files.map((file) => [file.path, {
    file,
    imports: [...(outgoing.get(file.path) ?? [])].sort(),
    dependents: [...(incoming.get(file.path) ?? [])].sort(),
  }]));
  const ranked = [...details.values()];
  return {
    files: details,
    mostImported: ranked.filter((item) => item.dependents.length > 0)
      .sort((a, b) => b.dependents.length - a.dependents.length || a.file.path.localeCompare(b.file.path)),
    // Among files with no dependents, start with those leading to the most files.
    entryFiles: ranked.filter((item) => item.dependents.length === 0)
      .sort((a, b) => b.imports.length - a.imports.length || a.file.path.localeCompare(b.file.path)),
  };
}
