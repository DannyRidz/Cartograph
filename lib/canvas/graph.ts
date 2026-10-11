import type { RepositoryEdge, RepositoryFile } from "../parser/types.ts";

export type Direction = "incoming" | "outgoing";

export function indexGraph(files: RepositoryFile[], edges: RepositoryEdge[]) {
  const incoming = new Map(files.map((file) => [file.path, new Set<string>()]));
  const outgoing = new Map(files.map((file) => [file.path, new Set<string>()]));
  for (const edge of edges) {
    if (!outgoing.has(edge.from) || !incoming.has(edge.to)) {
      throw new Error(`Missing graph endpoint: ${edge.from} -> ${edge.to}`);
    }
    outgoing.get(edge.from)?.add(edge.to);
    incoming.get(edge.to)?.add(edge.from);
  }
  return { incoming, outgoing };
}

export type GraphIndex = ReturnType<typeof indexGraph>;

// Breadth first traversal gives the shortest import distance, even inside cycles.
export function walkGraph(graph: GraphIndex, start: string, direction: Direction, depth = 2) {
  if (!Number.isSafeInteger(depth) || depth < 0) throw new Error("Depth must be a nonnegative integer");
  const neighbours = graph[direction];
  if (!neighbours.has(start)) throw new Error(`Missing graph file: ${start}`);
  const visited = new Set([start]);
  const queue = [{ path: start, depth: 0 }];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current.depth === depth) continue;
    for (const path of neighbours.get(current.path) ?? []) {
      if (visited.has(path)) continue;
      visited.add(path);
      queue.push({ path, depth: current.depth + 1 });
    }
  }
  return queue.slice(1).sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}

// Two iterative passes find strongly connected components without a call stack.
// Each cyclic component includes one real, closed import path for spot checking.
export function importCycles(graph: GraphIndex) {
  const outgoing = new Map([...graph.outgoing].map(([path, next]) => [path, [...next].sort()]));
  const visited = new Set<string>();
  const finished: string[] = [];
  const backEdges = new Map<string, string>();
  const parents = new Map<string, string>();
  for (const root of [...outgoing.keys()].sort()) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ path: root, cursor: 0 }];
    const active = new Map([[root, 0]]);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const next = outgoing.get(frame.path)?.[frame.cursor++];
      if (next === undefined) {
        finished.push(frame.path);
        active.delete(frame.path);
        stack.pop();
      } else if (active.has(next)) {
        if (!backEdges.has(next)) backEdges.set(next, frame.path);
      } else if (!visited.has(next)) {
        visited.add(next);
        parents.set(next, frame.path);
        active.set(next, stack.length);
        stack.push({ path: next, cursor: 0 });
      }
    }
  }
  const assigned = new Set<string>();
  const cycles: { files: string[]; path: string[] }[] = [];
  for (const root of finished.reverse()) {
    if (assigned.has(root)) continue;
    assigned.add(root);
    const members = [root];
    for (let cursor = 0; cursor < members.length; cursor++) {
      for (const next of graph.incoming.get(members[cursor]) ?? []) {
        if (!assigned.has(next)) { assigned.add(next); members.push(next); }
      }
    }
    if (members.length === 1 && !graph.outgoing.get(root)?.has(root)) continue;
    members.sort();
    const start = members.find((member) => backEdges.has(member));
    const end = start === undefined ? undefined : backEdges.get(start);
    if (start === undefined || end === undefined) throw new Error(`Cyclic component has no import path: ${root}`);
    const path = [end];
    while (path[path.length - 1] !== start) {
      const parent = parents.get(path[path.length - 1]);
      if (parent === undefined) throw new Error(`Missing cycle ancestor: ${start}`);
      path.push(parent);
    }
    cycles.push({ files: members, path: [...path.reverse(), start] });
  }
  return cycles.sort((a, b) => a.files[0].localeCompare(b.files[0]));
}
