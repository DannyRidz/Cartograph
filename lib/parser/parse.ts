import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { builtinModules } from "node:module";
import { Project, SyntaxKind, ts } from "ts-morph";
import { fallbackAdapter, type RepositoryAdapter } from "./adapter.ts";
import { calculateFanCounts, deduplicateEdges } from "./graph.ts";
import type { ImportKind, ImportOutcome, RepositoryEdge, RepositoryFile, RepositoryResult, SkippedFile } from "./types.ts";

const excludedDirectories = new Set([
  ".git", "node_modules", ".next", ".turbo", ".vercel", ".pnpm-store",
  "dist", "build", "out", "coverage",
]);
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const portable = (value: string) => value.split(path.sep).join("/");
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

interface FileConfiguration {
  options: ts.CompilerOptions;
  dependencies: Set<string>;
}

function configurationReader(root: string) {
  const cache = new Map<string, FileConfiguration>();
  return function configuration(directory: string): FileConfiguration {
    const cached = cache.get(directory);
    if (cached) return cached;
    const inherited = directory === root
      ? { options: { allowJs: true, jsx: ts.JsxEmit.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext }, dependencies: new Set<string>() }
      : configuration(path.dirname(directory));
    let options = inherited.options;
    const dependencies = new Set(inherited.dependencies);
    const configPath = ["tsconfig.json", "jsconfig.json"]
      .map((name) => path.join(directory, name)).find(ts.sys.fileExists);
    if (configPath) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
      // Only resolution settings are needed. File selection remains a complete directory walk.
      const parsed = ts.parseJsonConfigFileContent(config.config, { ...ts.sys, readDirectory: () => [] }, directory);
      const errors = parsed.errors.filter((error) => error.code !== 18003 && error.code !== 18002);
      if (errors.length) throw new Error(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
      options = { ...inherited.options, ...parsed.options };
    }
    const packagePath = path.join(directory, "package.json");
    const packageText = ts.sys.readFile(packagePath);
    if (packageText !== undefined) {
      const manifest: unknown = JSON.parse(packageText);
      if (manifest && typeof manifest === "object") {
        for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
          if (key in manifest) {
            const entries: unknown = Reflect.get(manifest, key);
            if (entries && typeof entries === "object") {
              for (const name of Object.keys(entries)) dependencies.add(name);
            }
          }
        }
      }
    }
    const result = { options, dependencies };
    cache.set(directory, result);
    return result;
  };
}

function matchesAlias(specifier: string, options: ts.CompilerOptions): boolean {
  return Object.keys(options.paths ?? {}).some((pattern) => {
    const star = pattern.indexOf("*");
    return star < 0 ? pattern === specifier
      : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1));
  });
}

export async function parseRepository(
  directory: string,
  adapter: RepositoryAdapter = fallbackAdapter,
): Promise<RepositoryResult> {
  const root = await realpath(path.resolve(directory));
  if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const candidates: string[] = [];
  const skipped: SkippedFile[] = [];
  const omitted: SkippedFile[] = [];
  let found = 0;
  async function walk(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(folder, entry.name);
      const relative = portable(path.relative(root, absolute));
      if (entry.isDirectory()) {
        if (excludedDirectories.has(entry.name)) omitted.push({ path: relative, reason: "dependency, generated output, or repository metadata directory" });
        else await walk(absolute);
        continue;
      }
      found++;
      if (entry.isSymbolicLink()) skipped.push({ path: relative, reason: "symbolic link, not followed" });
      else if (!entry.isFile()) skipped.push({ path: relative, reason: "not a regular file" });
      else if (!sourceExtension.test(entry.name)) skipped.push({ path: relative, reason: "unsupported file type, only TypeScript and JavaScript are parsed" });
      else candidates.push(absolute);
    }
  }
  await walk(root);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, checkJs: false, noResolve: true, jsx: ts.JsxEmit.Preserve },
  });
  const files: RepositoryFile[] = [];
  for (const absolute of candidates) {
    const relative = portable(path.relative(root, absolute));
    let content: string;
    try { content = await readFile(absolute, "utf8"); }
    catch (error) { skipped.push({ path: relative, reason: `read failed: ${message(error)}` }); continue; }
    project.createSourceFile(absolute, content, { overwrite: true });
  }
  const program = project.getProgram();
  for (const source of project.getSourceFiles()) {
    const relative = portable(path.relative(root, source.getFilePath()));
    const diagnostics = program.getSyntacticDiagnostics(source);
    if (diagnostics.length) {
      skipped.push({ path: relative, reason: `syntax error: ${diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.compilerObject.messageText, "\n")).join("; ")}` });
      continue;
    }
    const content = source.getFullText();
    const folder = portable(path.dirname(relative));
    files.push({
      path: relative, folder,
      ...adapter.classify({ path: relative, folder, isModule: ts.isExternalModule(source.compilerNode) }),
      lineCount: content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length - (/\r?\n$|\r$/.test(content) ? 1 : 0),
      hash: createHash("sha256").update(content).digest("hex"),
      fanIn: 0, fanOut: 0,
    });
  }
  const nodes = new Set(files.map((file) => file.path));
  const skips = new Map(skipped.map((file) => [file.path, file.reason]));
  const configuration = configurationReader(root);
  const imports: ImportOutcome[] = [];
  const edges: RepositoryEdge[] = [];
  async function record(file: string, line: number, kind: ImportKind, specifier: string | null) {
    const outcome: ImportOutcome = { file, line, kind, specifier, status: "unresolved", target: null, reason: null };
    if (specifier === null) outcome.reason = "dynamic import argument is not a string literal";
    else {
      const absolute = path.join(root, file);
      const config = configuration(path.dirname(absolute));
      const resolved = ts.resolveModuleName(specifier, absolute, config.options, ts.sys).resolvedModule;
      // An exact asset path is evidence of an excluded file even when TypeScript cannot load it.
      const exactPath = specifier.startsWith(".") || path.isAbsolute(specifier)
        ? path.resolve(path.dirname(absolute), specifier) : undefined;
      const resolvedPath = resolved?.resolvedFileName ?? (exactPath && ts.sys.fileExists(exactPath) ? exactPath : undefined);
      if (resolvedPath) {
        const target = await realpath(resolvedPath);
        outcome.target = inside(root, target) ? portable(path.relative(root, target)) : target;
        if (!inside(root, target) || portable(target).split("/").includes("node_modules")) {
          outcome.status = "external";
          outcome.reason = "resolved outside repository source";
        } else if (nodes.has(outcome.target)) {
          outcome.status = "resolved";
          edges.push({ from: file, to: outcome.target, kind });
        } else {
          outcome.status = "excluded";
          outcome.reason = skips.get(outcome.target) ?? "target is in an excluded directory";
        }
      } else {
        const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        if (builtins.has(specifier.replace(/^node:/, ""))) {
          outcome.status = "external";
          outcome.reason = "Node built-in module";
        } else if (!matchesAlias(specifier, config.options) && config.dependencies.has(packageName)) {
          outcome.status = "external";
          outcome.reason = "declared package dependency, not installed or not resolvable on disk";
        } else {
          outcome.reason = matchesAlias(specifier, config.options) ? "path alias target could not be resolved"
            : specifier.startsWith(".") || path.isAbsolute(specifier) ? "local module target could not be resolved"
            : "module could not be resolved and is not a declared dependency";
        }
      }
    }
    imports.push(outcome);
  }
  for (const source of project.getSourceFiles()) {
    const file = portable(path.relative(root, source.getFilePath()));
    if (!nodes.has(file)) continue;
    for (const declaration of source.getImportDeclarations()) {
      await record(file, declaration.getStartLineNumber(), "import", declaration.getModuleSpecifierValue());
    }
    for (const declaration of source.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier !== undefined) await record(file, declaration.getStartLineNumber(), "re-export", specifier);
    }
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
      const argument = call.getArguments()[0];
      await record(file, call.getStartLineNumber(), "dynamic-import", argument?.getKind() === SyntaxKind.StringLiteral ? argument.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue() : null);
    }
  }
  const uniqueEdges = deduplicateEdges(edges);
  const totals = { resolved: 0, external: 0, excluded: 0, unresolved: 0 };
  for (const outcome of imports) totals[outcome.status]++;
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: 1, adapter: adapter.name,
    files: calculateFanCounts(files, uniqueEdges), edges: uniqueEdges,
    coverage: { filesFound: found, filesParsed: files.length, filesSkipped: skipped.length,
      folders: new Set(files.map((file) => file.folder)).size, skipped,
      excludedDirectories: omitted, imports, totals },
  };
}
