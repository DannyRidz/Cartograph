import type { RepositoryFile } from "../parser/types.ts";
import { importCycles, type GraphIndex } from "./graph.ts";

export const insightSentences = {
  unimported: "No parsed file imports this file.",
  popular: "An unusual number of parsed files import this file.",
  cycle: "These files form an import cycle.",
  long: "This file has more than 500 lines.",
} as const;

export function repositoryInsights(files: RepositoryFile[], graph: GraphIndex, entryFiles: Set<string>) {
  const counts = files.map((file) => graph.incoming.get(file.path)?.size ?? 0);
  const mean = counts.reduce((sum, count) => sum + count, 0) / Math.max(1, counts.length);
  const deviation = Math.sqrt(counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) / Math.max(1, counts.length));
  const threshold = mean + 2 * deviation;
  return {
    unimported: files.filter((file, index) => counts[index] === 0 && !entryFiles.has(file.path)).map((file) => file.path).sort(),
    popular: files.filter((_, index) => counts[index] >= 10 && counts[index] > threshold)
      .map((file) => ({ path: file.path, count: graph.incoming.get(file.path)?.size ?? 0 }))
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
    cycles: importCycles(graph),
    long: files.filter((file) => file.lineCount > 500).map((file) => ({ path: file.path, count: file.lineCount }))
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
    threshold,
  };
}
