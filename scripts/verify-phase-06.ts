import assert from "node:assert/strict";
import { readRepositoryResult } from "../lib/parser/data.ts";
import type { RepositoryEdge, RepositoryFile } from "../lib/parser/types.ts";
import { conventionalEntryFiles } from "../lib/adapters/conventions.ts";
import { importCycles, indexGraph, walkGraph } from "../lib/canvas/graph.ts";
import { repositoryInsights } from "../lib/canvas/insights.ts";
import { foldRepository } from "../lib/canvas/folding.ts";
import { canvasConnections } from "../lib/canvas/connections.ts";

const file = (path: string, lineCount = 1): RepositoryFile => ({ path, folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".", module: ".", kind: "module", lineCount, hash: "0".repeat(64), fanIn: 0, fanOut: 0 });
const edge = (from: string, to: string): RepositoryEdge => ({ from, to, kind: "import" });
const files = ["a", "b", "c", "d", "e", "unused"].map((path) => file(path));
const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("c", "d"), edge("d", "e"), { ...edge("a", "b"), kind: "re-export" as const }];
const graph = indexGraph(files, edges);
assert.deepEqual(walkGraph(graph, "a", "outgoing"), [{ path: "b", depth: 1 }, { path: "c", depth: 2 }]);
assert.deepEqual(walkGraph(graph, "d", "incoming"), [{ path: "c", depth: 1 }, { path: "b", depth: 2 }]);
assert.deepEqual(walkGraph(graph, "a", "outgoing", 0), []);
assert.equal(walkGraph(graph, "a", "outgoing", 10).length, 4);
assert.deepEqual(walkGraph(graph, "unused", "incoming"), []);
assert.throws(() => walkGraph(graph, "absent", "outgoing"));
assert.throws(() => walkGraph(graph, "a", "outgoing", -1));
assert.throws(() => indexGraph(files, [edge("a", "absent")]));
assert.deepEqual(importCycles(graph), [{ files: ["a", "b", "c"], path: ["a", "b", "c", "a"] }]);
assert.deepEqual(importCycles(indexGraph([file("self")], [edge("self", "self")])), [{ files: ["self"], path: ["self", "self"] }]);
assert.deepEqual(importCycles(indexGraph([], [])), []);

const conventionPaths = ["app/page.tsx", "app/api/items/route.ts", "src/app/(group)/layout.tsx", "pages/index.js", "src/pages/api/items.ts", "middleware.ts", "src/proxy.ts", "next.config.ts", "eslint.config.mjs", "postcss.config.js", "packages/web/src/app/page.tsx", "packages/web/src/proxy.ts"];
const conventionFiles = [...conventionPaths.map((path) => file(path)), file("lib/page.ts"), file("lib/unused.ts"), file("short.ts", 500), file("long.ts", 501)];
const entries = conventionalEntryFiles(conventionFiles);
assert.deepEqual([...entries], conventionPaths);
assert.deepEqual([...conventionalEntryFiles([file("tsdown.config.mts"), file(".size-limit.cjs")])], ["tsdown.config.mts", ".size-limit.cjs"], "Tool config files must be excluded from unimported insights");
const conventionInsights = repositoryInsights(conventionFiles, indexGraph(conventionFiles, []), entries);
assert.deepEqual(conventionInsights.unimported, ["lib/page.ts", "lib/unused.ts", "long.ts", "short.ts"]);
assert.deepEqual(conventionInsights.long, [{ path: "long.ts", count: 501 }]);
const popularFiles = [file("hub"), ...Array.from({ length: 30 }, (_, index) => file(`consumer-${index}`))];
const popularEdges = popularFiles.slice(1).map((item) => edge(item.path, "hub"));
assert.deepEqual(repositoryInsights(popularFiles, indexGraph(popularFiles, popularEdges), new Set()).popular, [{ path: "hub", count: 30 }]);
const smallFiles = popularFiles.slice(0, 10);
assert.deepEqual(repositoryInsights(smallFiles, indexGraph(smallFiles, popularEdges.slice(0, 9)), new Set()).popular, []);

// Check components against independent exhaustive reachability on small graphs.
let seed = 6;
for (let trial = 0; trial < 80; trial++) {
  const members = Array.from({ length: 8 }, (_, index) => file(String(index)));
  const links: RepositoryEdge[] = [];
  for (const from of members) for (const to of members) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    if (seed % 7 === 0) links.push(edge(from.path, to.path));
  }
  const indexed = indexGraph(members, links);
  const reach = members.map((start) => {
    const found = new Set([start.path]);
    for (let pass = 0; pass < members.length; pass++) for (const link of links) if (found.has(link.from)) found.add(link.to);
    return found;
  });
  const expected: string[][] = [];
  const assigned = new Set<string>();
  for (let index = 0; index < members.length; index++) {
    const start = members[index].path;
    if (assigned.has(start)) continue;
    const component = members.filter((item, other) => reach[index].has(item.path) && reach[other].has(start)).map((item) => item.path).sort();
    for (const item of component) assigned.add(item);
    if (component.length > 1 || links.some((link) => link.from === start && link.to === start)) expected.push(component);
  }
  const cycles = importCycles(indexed);
  assert.deepEqual(cycles.map((cycle) => cycle.files), expected);
  for (const cycle of cycles) {
    assert.equal(cycle.path[0], cycle.path.at(-1));
    for (let index = 1; index < cycle.path.length; index++) assert(indexed.outgoing.get(cycle.path[index - 1])?.has(cycle.path[index]));
  }
}
const deepFiles = Array.from({ length: 25000 }, (_, index) => file(String(index)));
const deepEdges = deepFiles.slice(1).map((item, index) => edge(String(index), item.path));
assert.equal(importCycles(indexGraph(deepFiles, deepEdges)).length, 0);
deepEdges.push(edge("24999", "0"));
assert.equal(importCycles(indexGraph(deepFiles, deepEdges))[0].files.length, 25000);
console.log("Walk direction, depth, cycles, duplicate imports, framework exclusions, thresholds and 25,000 file iterative traversal passed.");

const repository = await readRepositoryResult("lib/fixtures/redux-toolkit.json");
const fixtureGraph = indexGraph(repository.files, repository.edges);
const insights = repositoryInsights(repository.files, fixtureGraph, conventionalEntryFiles(repository.files));
assert(insights.cycles.length > 0, "The checked in repository must have a real import cycle");
for (const cycle of insights.cycles) for (let index = 1; index < cycle.path.length; index++) {
  assert(repository.edges.some((link) => link.from === cycle.path[index - 1] && link.to === cycle.path[index]), "Cycle contains an invented import");
}
const folded = foldRepository(repository.files, repository.edges);
for (const kind of ["module", "script"] as const) {
  const matches = new Set(repository.files.filter((item) => item.kind === kind).map((item) => item.path));
  assert.equal(folded.modules.reduce((sum, module) => sum + module.files.filter((item) => matches.has(item.path)).length, 0), matches.size);
  const allOpen = new Set(folded.modules.map((module) => module.id));
  const original = canvasConnections(folded.modules, repository.edges, allOpen, null);
  const filtered = canvasConnections(folded.modules, repository.edges, allOpen, null, new Map(), matches);
  assert.deepEqual(filtered.edges.map((item) => item.id), original.edges.map((item) => item.id), "Category removed edges");
}
const sample = insights.popular[0]?.path ?? repository.files[0].path;
for (const item of walkGraph(fixtureGraph, sample, "incoming")) {
  const immediate = fixtureGraph.incoming.get(sample);
  assert(item.depth === 1 ? immediate?.has(item.path) : [...(immediate ?? [])].some((path) => fixtureGraph.incoming.get(path)?.has(item.path)));
}
console.log(`Fixture: ${insights.unimported.length} unimported files, ${insights.popular.length} files with many importers, ${insights.cycles.length} cyclic groups, ${insights.long.length} files over 500 lines.`);
console.log(`Real cycle: ${insights.cycles[0].path.join(" -> ")}`);
console.log("Fixture cycle paths, blast radius, panel match totals and category edge conservation passed.");
