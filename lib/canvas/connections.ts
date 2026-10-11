import type { RepositoryEdge } from "../parser/types.ts";
import type { FoldedModule } from "./folding.ts";
import { filePort, panelWindow } from "./window.ts";

/**
 * Groups parsed imports by visible canvas ports and returns selection-related active files.
 * Category filters take precedence for edge dimming and require both endpoints to match.
 * Throws when an import endpoint has no canvas file.
 */
export function canvasConnections(modules: FoldedModule[], edges: RepositoryEdge[], opened: Set<string>, selected: string | null, offsets: Map<string, number> = new Map(), categoryFiles: Set<string> | null = null) {
  const selectedFiles = selected === null ? null : new Set(modules.find((module) => module.id === selected)?.files.map((file) => file.path) ?? [selected]);
  const activeFiles = selectedFiles === null ? null : new Set(selectedFiles);
  if (selectedFiles && activeFiles) for (const edge of edges) {
    if (selectedFiles.has(edge.from) || selectedFiles.has(edge.to)) { activeFiles.add(edge.from); activeFiles.add(edge.to); }
  }
  const endpoints = new Map(modules.flatMap((module) => module.files.map((file, index) => [file.path, {
    id: module.id,
    handle: !opened.has(module.id) ? "folder" : filePort(index, file.path, panelWindow(module.files.length, offsets.get(module.id))),
  }] as const)));
  const connections = new Map<string, { id: string; source: string; target: string; sourceHandle: string; targetHandle: string; active: boolean; direction: "incoming" | "outgoing" | null }>();
  for (const edge of edges) {
    const source = endpoints.get(edge.from);
    const target = endpoints.get(edge.to);
    if (!source || !target) throw new Error(`Missing canvas endpoint: ${edge.from} -> ${edge.to}`);
    if (source.id === target.id && !opened.has(source.id)) continue;
    const id = JSON.stringify([source.id, source.handle, target.id, target.handle]);
    const active = categoryFiles !== null ? categoryFiles.has(edge.from) && categoryFiles.has(edge.to)
      : selectedFiles === null || selectedFiles.has(edge.from) || selectedFiles.has(edge.to);
    const direction = selectedFiles?.has(edge.to) ? "incoming" : selectedFiles?.has(edge.from) ? "outgoing" : null;
    const previous = connections.get(id);
    if (previous) {
      if (active) { previous.active = true; previous.direction = direction; }
    } else connections.set(id, { id, source: source.id, target: target.id, sourceHandle: `${source.handle}:out`, targetHandle: `${target.handle}:in`, active, direction });
  }
  return { activeFiles, edges: [...connections.values()] };
}
