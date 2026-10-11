import assert from "node:assert/strict";
import { readRepositoryResult } from "../lib/parser/data.ts";
import { foldRepository, uniqueLabels } from "../lib/canvas/folding.ts";
import { layoutModules, moduleSize, PANEL_ROWS } from "../lib/canvas/layout.ts";
import { filePort, panelPorts, panelWindow, ROW_HEIGHT } from "../lib/canvas/window.ts";
import { canvasConnections } from "../lib/canvas/connections.ts";

const filename = process.argv[2];
if (!filename) throw new Error("Usage: node --experimental-strip-types scripts/verify-canvas.ts <parser-output.json>");
const repository = await readRepositoryResult(filename);
const { modules, owner, threshold } = foldRepository(repository.files, repository.edges);
assert(modules.length <= 24, "Too many folded nodes");
assert(modules.every((folder) => folder.files.length > 1), "Singleton folded node");
assert.equal(new Set(modules.flatMap((folder) => folder.files.map((file) => file.path))).size, repository.files.length, "Folding lost or duplicated files");
assert.equal(modules.reduce((total, folder) => total + folder.files.length, 0), repository.files.length);
assert.deepEqual(foldRepository([...repository.files].reverse(), [...repository.edges].reverse()).modules, modules, "Folding depends on input order");
const labels = uniqueLabels(modules.map((folder) => folder.id));
const closed = new Set<string>();
const initial = layoutModules(modules, repository.edges, owner, closed, labels);
assert.deepEqual(layoutModules(modules, repository.edges, owner, closed, labels), initial, "Layout is not deterministic");
function assertNoOverlap(positions: ReturnType<typeof layoutModules>) {
  for (let i = 0; i < positions.length; i++) for (const other of positions.slice(i + 1)) {
    const node = positions[i];
    assert(!(node.position.x < other.position.x + other.width && node.position.x + node.width > other.position.x
      && node.position.y < other.position.y + other.height && node.position.y + node.height > other.position.y), "Layout overlaps folder nodes");
  }
}
assertNoOverlap(initial);
const initialWidth = Math.max(...initial.map((node) => node.position.x + node.width));
const initialHeight = Math.max(...initial.map((node) => node.position.y + node.height));
// Protect this preview fixture against the excessive vertical gaps found in Chrome.
assert(initialHeight <= 600, "The initial fixture layout again forces labels to shrink");
const ids = new Set(modules.map((folder) => folder.id));
let checkedEdges = 0;
for (const folder of modules) {
  const expanded = new Set([folder.id]);
  assertNoOverlap(layoutModules(modules, repository.edges, owner, expanded, labels));
  for (const offset of [0, ROW_HEIGHT / 2, Math.floor(folder.files.length / 2) * ROW_HEIGHT, folder.files.length * ROW_HEIGHT]) {
    const offsets = new Map([[folder.id, offset]]);
    const connections = canvasConnections(modules, repository.edges, expanded, null, offsets);
    const window = panelWindow(folder.files.length, offset);
    const ports = panelPorts(folder.files.map((file) => file.path), true, offset, 64 + window.height + (folder.files.length > PANEL_ROWS ? ROW_HEIGHT * 2 : 0));
    const portIds = new Set(ports.map((port) => port.id));
    assert(ports.every((port) => Number.isFinite(port.y) && port.y > 0), "Invalid panel port coordinate");
    assert(window.end - window.start <= PANEL_ROWS, "Too many visible row ports");
    assert.equal(window.above + window.end - window.start + window.below, folder.files.length);
    for (const edge of connections.edges) {
      assert(ids.has(edge.source) && ids.has(edge.target), "Edge terminates on a missing node");
      for (const [id, handle] of [[edge.source, edge.sourceHandle], [edge.target, edge.targetHandle]]) {
        const node = modules.find((candidate) => candidate.id === id);
        assert(node);
        const port = handle.slice(0, handle.lastIndexOf(":"));
        if (id === folder.id) assert(portIds.has(port), "Edge and handle updates disagree");
        assert(expanded.has(id)
          ? node.files.slice(window.start, window.end).some((file) => file.path === port)
            || (port === "above" && window.above > 0) || (port === "below" && window.below > 0)
          : port === "folder", "Edge terminates on a missing row handle");
      }
      checkedEdges++;
    }
    for (const original of repository.edges) {
      const source = owner.get(original.from);
      const target = owner.get(original.to);
      if (source !== folder.id && target !== folder.id) continue;
      const sourcePort = source === folder.id ? filePort(folder.files.findIndex((file) => file.path === original.from), original.from, window) : "folder";
      const targetPort = target === folder.id ? filePort(folder.files.findIndex((file) => file.path === original.to), original.to, window) : "folder";
      assert(connections.edges.some((edge) => edge.source === source && edge.target === target && edge.sourceHandle === `${sourcePort}:out` && edge.targetHandle === `${targetPort}:in`), "Scrolling lost or misrouted a real import");
    }
    const lastFile = folder.files.at(-1)?.path;
    assert(lastFile);
    const selectedLast = canvasConnections(modules, repository.edges, expanded, lastFile, offsets);
    assert(selectedLast.activeFiles?.has(lastFile), "Scrolling lost file selection");
    for (const edge of repository.edges.filter((edge) => edge.from === lastFile || edge.to === lastFile)) {
      assert(selectedLast.activeFiles?.has(edge.from) && selectedLast.activeFiles?.has(edge.to), "Scrolling dimmed a selected neighbour");
    }
  }
  const maximum = Math.max(...modules.map((node) => node.fanIn));
  const size = moduleSize(folder, false, maximum, labels);
  assert.equal(size.height, 64 + Math.round(120 * folder.fanIn / Math.max(1, maximum)), "Height does not encode fan in");
  const selectedFile = folder.files[0].path;
  const selection = canvasConnections(modules, repository.edges, expanded, selectedFile);
  const expected = new Set([selectedFile]);
  for (const edge of repository.edges) if (edge.from === selectedFile || edge.to === selectedFile) { expected.add(edge.from); expected.add(edge.to); }
  assert.deepEqual(selection.activeFiles, expected, "Selection dims an adjacent endpoint");
}
if (threshold > 2) {
  // The production function retries from the original file list, never an earlier fold.
  assert.equal(foldRepository(repository.files, repository.edges).threshold, threshold);
}
console.log(`Files: ${repository.files.length}; folded nodes: ${modules.length}; files per node: ${(repository.files.length / modules.length).toFixed(1)}; threshold: ${threshold}`);
console.log(`Singleton nodes: ${modules.filter((folder) => folder.files.length < 2).length}; invalid endpoints: 0; checked expanded edges: ${checkedEdges}`);
console.log(`Initial layout: ${initialWidth.toFixed(1)} by ${initialHeight.toFixed(1)}; overlapping nodes: 0`);
console.log("File conservation, input order independence, deterministic layout, row handles, selection and fan in heights passed.");
