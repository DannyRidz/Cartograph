import { graphlib, layout } from "@dagrejs/dagre";
import type { FoldedModule } from "./folding.ts";
import type { RepositoryEdge } from "../parser/types.ts";

import { PANEL_ROWS, ROW_HEIGHT } from "./window.ts";
export { PANEL_ROWS, ROW_HEIGHT } from "./window.ts";
export const PANEL_HEADER = 64;

export function moduleSize(module: FoldedModule, opened: boolean, maxFanIn: number, labels: Map<string, string>) {
  const longest = Math.max((labels.get(module.id) ?? module.label).length, ...(opened ? module.files.map((file) => (labels.get(file.path) ?? file.path).length) : []));
  return {
    width: Math.max(opened ? 160 : 112, longest * 7.2 + (opened ? 84 : 24)),
    height: opened
      ? PANEL_HEADER + Math.min(PANEL_ROWS, module.files.length) * ROW_HEIGHT + (module.files.length > PANEL_ROWS ? ROW_HEIGHT * 2 : 0)
      : 64 + Math.round(120 * module.fanIn / Math.max(1, maxFanIn)),
  };
}

function coordinates(value: unknown): { x: number; y: number } {
  if (value && typeof value === "object" && "x" in value && "y" in value && typeof value.x === "number" && typeof value.y === "number") return { x: value.x, y: value.y };
  throw new Error("Layout did not return node coordinates");
}

export function layoutModules(modules: FoldedModule[], edges: RepositoryEdge[], owner: Map<string, string>, opened: Set<string>, labels: Map<string, string>) {
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 12, ranksep: 20, edgesep: 4, marginx: 12, marginy: 12 });
  graph.setDefaultEdgeLabel(() => ({}));
  const maxFanIn = Math.max(0, ...modules.map((module) => module.fanIn));
  const sizes = new Map(modules.map((module) => [module.id, moduleSize(module, opened.has(module.id), maxFanIn, labels)]));
  for (const folder of modules) graph.setNode(folder.id, sizes.get(folder.id));
  const pairs = new Set<string>();
  for (const edge of edges) {
    const from = owner.get(edge.from);
    const to = owner.get(edge.to);
    if (from === undefined || to === undefined) throw new Error("Edge has no folded module");
    if (from !== to) pairs.add(JSON.stringify([from, to]));
  }
  // Stable insertion order keeps Dagre's cycle breaking and tie breaking reproducible.
  for (const pair of [...pairs].sort()) {
    const [from, to]: unknown[] = JSON.parse(pair);
    if (typeof from !== "string" || typeof to !== "string") throw new Error("Invalid layout edge");
    graph.setEdge(from, to);
  }
  layout(graph);
  const placed = modules.map((module) => {
    const size = sizes.get(module.id);
    if (!size) throw new Error("Missing module dimensions");
    const point = coordinates(graph.node(module.id));
    return { id: module.id, ...size, position: { x: point.x - size.width / 2, y: point.y - size.height / 2 } };
  });

  // Dagre reserves space for routed edges that React Flow routes independently.
  // Retain its dependency columns and ordering, but remove those unused gaps.
  const columns = new Map<string, typeof placed>();
  for (const node of placed) {
    const column = (node.position.x + node.width / 2).toFixed(6);
    const members = columns.get(column) ?? [];
    members.push(node);
    columns.set(column, members);
  }
  const ordered = [...columns].sort(([a], [b]) => Number(a) - Number(b)).map(([, members]) => members.sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id)));
  const columnHeight = (members: typeof placed) => members.reduce((height, node) => height + node.height, 0) + Math.max(0, members.length - 1) * 12;
  const height = Math.max(0, ...ordered.map(columnHeight));
  let x = 12;
  for (const members of ordered) {
    const width = Math.max(...members.map((node) => node.width));
    let y = 12 + (height - columnHeight(members)) / 2;
    for (const node of members) {
      node.position = { x: x + (width - node.width) / 2, y };
      y += node.height + 12;
    }
    x += width + 20;
  }
  return placed;
}
