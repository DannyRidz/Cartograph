import type { RepositoryEdge, RepositoryFile } from "../parser/types.ts";

export interface FoldedModule {
  id: string;
  label: string;
  files: RepositoryFile[];
  fanIn: number;
  fanOut: number;
}

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const depth = (folder: string) => folder === "." ? 0 : folder.split("/").length;
const parent = (folder: string) => folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : ".";

export function uniqueLabels(paths: string[]): Map<string, string> {
  return new Map(paths.map((path) => {
    const parts = path.split("/");
    for (let length = 1; length <= parts.length; length++) {
      const label = parts.slice(-length).join("/");
      if (!paths.some((other) => other !== path && (other === label || other.endsWith(`/${label}`)))) return [path, label];
    }
    return [path, path];
  }));
}

function foldAt(files: RepositoryFile[], threshold: number): Map<string, RepositoryFile[]> {
  const groups = new Map<string, RepositoryFile[]>([[".", []]]);
  for (const file of [...files].sort((a, b) => compare(a.path, b.path))) {
    let folder = file.folder;
    while (!groups.has(folder)) {
      groups.set(folder, []);
      if (folder === ".") break;
      folder = parent(folder);
    }
    groups.get(file.folder)?.push(file);
  }
  const deepest = Math.max(0, ...[...groups.keys()].map(depth));
  for (let level = deepest; level > 0; level--) {
    // All decisions at one depth read the same snapshot, before any merge.
    const merges = [...groups].filter(([folder, members]) => depth(folder) === level && members.length < threshold);
    for (const [folder, members] of merges) {
      groups.get(parent(folder))?.push(...members);
      groups.delete(folder);
    }
  }
  return new Map([...groups].filter(([, members]) => members.length > 0));
}

export function foldRepository(files: RepositoryFile[], edges: RepositoryEdge[]) {
  const paths = new Set(files.map((file) => file.path));
  for (const edge of edges) {
    if (!paths.has(edge.from) || !paths.has(edge.to)) throw new Error(`Missing edge endpoint: ${edge.from} -> ${edge.to}`);
  }
  let threshold = 2;
  let groups = foldAt(files, threshold);
  while ((groups.size > 24 || [...groups.values()].some((members) => members.length === 1)) && threshold <= files.length) {
    groups = foldAt(files, ++threshold);
  }
  const owner = new Map([...groups].flatMap(([folder, members]) => members.map((file) => [file.path, folder] as const)));
  const labels = uniqueLabels([...groups.keys()]);
  const modules: FoldedModule[] = [...groups].sort(([a], [b]) => compare(a, b)).map(([id, members]) => ({
    id,
    label: labels.get(id) ?? id,
    files: members.sort((a, b) => compare(a.path, b.path)),
    fanIn: new Set(edges.filter((edge) => owner.get(edge.to) === id && owner.get(edge.from) !== id).map((edge) => edge.from)).size,
    fanOut: new Set(edges.filter((edge) => owner.get(edge.from) === id && owner.get(edge.to) !== id).map((edge) => edge.to)).size,
  }));
  return { modules, owner, threshold };
}
