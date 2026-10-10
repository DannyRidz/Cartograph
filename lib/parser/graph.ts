import type { RepositoryEdge, RepositoryFile } from "./types.ts";

export function deduplicateEdges(edges: RepositoryEdge[]): RepositoryEdge[] {
  const unique = new Map<string, RepositoryEdge>();
  for (const edge of edges) {
    unique.set(JSON.stringify([edge.from, edge.to, edge.kind]), edge);
  }
  return [...unique.values()].sort((a, b) =>
    a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind),
  );
}

export function calculateFanCounts(
  files: RepositoryFile[],
  edges: RepositoryEdge[],
): RepositoryFile[] {
  const incoming = new Map(files.map((file) => [file.path, new Set<string>()]));
  const outgoing = new Map(files.map((file) => [file.path, new Set<string>()]));
  for (const edge of edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) {
      throw new Error(`Edge has no corresponding node: ${edge.from} -> ${edge.to}`);
    }
    incoming.get(edge.to)?.add(edge.from);
    outgoing.get(edge.from)?.add(edge.to);
  }
  return files.map((file) => ({
    ...file,
    fanIn: incoming.get(file.path)?.size ?? 0,
    fanOut: outgoing.get(file.path)?.size ?? 0,
  }));
}
