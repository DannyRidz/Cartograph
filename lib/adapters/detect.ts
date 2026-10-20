import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Node, Project, SyntaxKind, type Node as SyntaxNode } from "ts-morph";
import { literal } from "./syntax.ts";
import { fallbackAdapter, type RepositoryAdapter } from "../parser/adapter.ts";
import { nextjsAdapter, type ApplicationRoot } from "./nextjs.ts";
import { nestjsAdapter } from "./nestjs.ts";
import { reactAdapter } from "./react.ts";

const excluded = new Set([".git", "node_modules", ".next", ".turbo", ".vercel", ".pnpm-store", "dist", "build", "out", "coverage"]);
export async function detectRepositoryAdapter(directory: string): Promise<RepositoryAdapter> {
  const packages: { prefix: string; dependencies: Set<string> }[] = [];
  async function walk(folder: string) {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory() && !excluded.has(entry.name)) await walk(absolute);
      if (!entry.isFile() || entry.name !== "package.json") continue;
      const manifest: unknown = JSON.parse(await readFile(absolute, "utf8"));
      if (!manifest || typeof manifest !== "object") continue;
      const dependencies = new Set<string>();
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const section: unknown = Reflect.get(manifest, key);
        if (section && typeof section === "object" && !Array.isArray(section)) for (const name of Object.keys(section)) dependencies.add(name);
      }
      const relative = path.relative(directory, folder).split(path.sep).join("/");
      packages.push({ prefix: relative ? `${relative}/` : "", dependencies });
    }
  }
  directory = path.resolve(directory);
  await walk(directory);
  // Specific frameworks must win before their shared UI dependency.
  const applications = packages.filter((entry) => entry.dependencies.has("next"));
  if (applications.length) {
    const roots: ApplicationRoot[] = [];
    for (const application of applications) {
      const entries = await readdir(path.join(directory, application.prefix));
      let routesSafe = true;
      let basePath = "";
      async function conventionDirectory(name: string): Promise<string | null> {
        for (const candidate of [`${name}/`, `src/${name}/`]) {
          try { if ((await stat(path.join(directory, application.prefix, candidate))).isDirectory()) return candidate; }
          catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
        }
        return null;
      }
      const appDirectory = await conventionDirectory("app");
      const pagesDirectory = await conventionDirectory("pages");
      for (const name of entries.filter((entry) => /^next\.config\.[cm]?[jt]s$/.test(entry))) {
        const config = await readFile(path.join(directory, application.prefix, name), "utf8");
        // Config wrappers, imported config and dynamic exports can hide route changes.
        // Only a plain static object without route overrides is safe to project.
        const project = new Project({ useInMemoryFileSystem: true });
        const source = project.createSourceFile(name, config);
        function unwrap(node: SyntaxNode | undefined, seen = new Set<SyntaxNode>()): SyntaxNode | undefined {
          if (!node || seen.has(node)) return undefined;
          seen.add(node);
          if (Node.isSatisfiesExpression(node) || Node.isAsExpression(node) || Node.isParenthesizedExpression(node)) return unwrap(node.getExpression(), seen);
          if (Node.isIdentifier(node)) {
            const declaration = node.getSymbol()?.getDeclarations()[0];
            if (declaration && Node.isVariableDeclaration(declaration) && declaration.getVariableStatement()?.getDeclarationKind() === "const") return unwrap(declaration.getInitializer(), seen);
          }
          return node;
        }
        const assignment = source.getExportAssignments().find((entry) => !entry.isExportEquals());
        const common = source.getDescendantsOfKind(SyntaxKind.BinaryExpression).find((entry) => entry.getLeft().getText() === "module.exports" && entry.getOperatorToken().getKind() === SyntaxKind.EqualsToken);
        const expression = unwrap(assignment?.getExpression() ?? common?.getRight());
        routesSafe &&= !!expression && Node.isObjectLiteralExpression(expression);
        if (expression && Node.isObjectLiteralExpression(expression)) {
          for (const property of expression.getProperties()) {
            if (!Node.isPropertyAssignment(property) || Node.isComputedPropertyName(property.getNameNode())) { routesSafe = false; continue; }
            if (["i18n", "pageExtensions", "rewrites", "trailingSlash"].includes(property.getName())) routesSafe = false;
            if (property.getName() === "basePath") {
              const value = literal(unwrap(property.getInitializer()));
              if (value === "" || (value?.startsWith("/") && !value.endsWith("/"))) basePath = value;
              else routesSafe = false;
            }
          }
        }
        if (source.getDescendantsOfKind(SyntaxKind.CallExpression).length) routesSafe = false;
        // Mutations after initialization can hide settings outside the exported object.
        if (source.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((entry) =>
          Node.isPropertyAccessExpression(entry.getLeft()) && entry !== common)) routesSafe = false;
      }
      roots.push({ prefix: application.prefix, routesSafe, basePath, appDirectory, pagesDirectory });
    }
    return nextjsAdapter(roots);
  }
  if (packages.some((entry) => entry.dependencies.has("@nestjs/core"))) return nestjsAdapter;
  if (packages.some((entry) => entry.dependencies.has("react"))) return reactAdapter;
  return fallbackAdapter;
}
