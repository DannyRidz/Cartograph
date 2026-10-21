import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseRepository } from "../lib/parser/parse.ts";
import { detectRepositoryAdapter } from "../lib/adapters/detect.ts";
import { fileContext, isSemanticRole } from "../lib/ai/context.ts";
import { contentHash } from "../lib/ai/cache.ts";
import { explanationGraph } from "../lib/ai/explanation-context.ts";
import { foldRepository } from "../lib/canvas/folding.ts";
import type { RoleCase, ExplanationCase } from "../evals/dataset.ts";

const commit = "5393cdc2651af9260f3fc97c4505ab280f4e0131";
const root = process.argv[2];
if (!root) throw new Error(`Supply the extracted TanStack/query ${commit} directory.`);
const roots = ["packages/react-query", "packages/react-query-persist-client", "packages/react-query-next-experimental",
  "examples/react/basic", "examples/react/pagination", "examples/react/simple",
  "examples/react/load-more-infinite-scroll", "examples/react/default-query-function", "examples/react/auto-refetching",
  "examples/react/infinite-query-with-max-pages", "examples/react/batching", "examples/react/devtools-panel",
  "examples/react/prefetching", "examples/react/star-wars", "examples/react/offline", "examples/react/algolia"];
const roles: RoleCase[] = [];
const explanations: ExplanationCase[] = [];
for (const prefix of roots) {
  const directory = path.resolve(root, prefix);
  const repository = await parseRepository(directory, await detectRepositoryAdapter(directory));
  const candidates = repository.files.filter((file) => isSemanticRole(file.role) && !/(?:__tests__|\.test[.-]|\.spec\.)/.test(file.path));
  for (const file of candidates) {
    if (!isSemanticRole(file.role)) throw new Error("Unsupported conventional role.");
    const source = await readFile(path.join(directory, file.path), "utf8");
    if (contentHash(source) !== file.hash) throw new Error("Dataset source hash changed.");
    const context = fileContext(repository, file);
    const hidden = { ...context.file };
    delete hidden.role;
    roles.push({ path: `${prefix}/${file.path}`, input: JSON.stringify({ ...context, file: hidden, source }), expected: file.role });
  }
  // Full small selections, never a truncated member or neighbour list.
  const file = candidates[0];
  const folder = foldRepository(repository.files, repository.edges).modules.find((item) => item.files.length >= 2 && item.files.length <= 6);
  const kind = explanations.length % 2 === 0 || !folder ? "file" : "folder";
  const members = kind === "folder" && folder ? folder.files : file ? [file] : [];
  if (!members.length || explanations.length >= 6) continue;
  const target = kind === "folder" && folder ? folder.id : members[0].path;
  const memberPaths = new Set(members.map((item) => item.path));
  const edges = repository.edges.filter((edge) => memberPaths.has(edge.from) || memberPaths.has(edge.to))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
  const paths = [...new Set([...memberPaths, ...edges.flatMap((edge) => [edge.from, edge.to])])].sort();
  const context = kind === "file" ? fileContext(repository, members[0]) : {
    folder: target, members, edges, neighbours: repository.files.filter((member) => paths.includes(member.path) && !memberPaths.has(member.path)),
  };
  const sources = await Promise.all(members.map(async (member) => ({ path: member.path, source: await readFile(path.join(directory, member.path), "utf8") })));
  const input = JSON.stringify({ kind, target, context, graph: explanationGraph(edges, [...memberPaths]), sources });
  if (input.length > 600_000) throw new Error("Dataset selection exceeds application input limit.");
  const externalSpecifiers = [...new Set(repository.coverage.imports.flatMap((entry) =>
    entry.status === "external" && memberPaths.has(entry.file) && entry.specifier ? [entry.specifier] : []))].sort();
  explanations.push({ kind, target, input, members: [...memberPaths], paths, edges, externalSpecifiers });
}
if (roles.length < 30) throw new Error(`Only ${roles.length} eligible conventional files, need thirty.`);
const licence = await readFile(path.resolve(root, "LICENSE"), "utf8");
await writeFile(new URL("../evals/TANSTACK-LICENSE", import.meta.url), licence);
await writeFile(new URL("../evals/dataset.json", import.meta.url), JSON.stringify({ repository: "https://github.com/TanStack/query", commit,
  roots, note: "Parsed independently per React package/example boundary. Target roles hidden; no model labels. Test files excluded.", roles, explanations }, null, 2) + "\n");
console.log(`Built ${roles.length} held out roles and ${explanations.length} explanation selections from ${commit}.`);
