import { Node, SyntaxKind } from "ts-morph";
import { fallbackAdapter, type RepositoryAdapter } from "../parser/adapter.ts";
import type { RepositoryRoute } from "../parser/types.ts";
import { reactRole } from "./react.ts";
import { directive } from "./syntax.ts";

export interface ApplicationRoot { prefix: string; routesSafe: boolean; basePath: string; appDirectory: string | null; pagesDirectory: string | null }
const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

function appPattern(parts: string[], groups = true): string | undefined {
  const segments: string[] = [];
  for (const part of parts) {
    // Parallel and intercepted routes need render context which a path alone cannot prove.
    if ((groups && part.startsWith("_")) || part.startsWith("@") || /^\(\./.test(part)) return undefined;
    if (groups && /^\([^()]+\)$/.test(part)) continue;
    if (!/^(?:[\w.~-]+|\[[\w]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])$/.test(part)) return undefined;
    segments.push(part);
  }
  return `/${segments.join("/")}`;
}

export function nextjsAdapter(roots: ApplicationRoot[]): RepositoryAdapter {
  return { ...fallbackAdapter, name: "nextjs", inspect(file, source) {
    const root = roots.filter((entry) => file.path.startsWith(entry.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
    const relative = root ? file.path.slice(root.prefix.length) : "";
    const appPath = root?.appDirectory && relative.startsWith(root.appDirectory) ? `app/${relative.slice(root.appDirectory.length)}` : "";
    const pagesPath = root?.pagesDirectory && relative.startsWith(root.pagesDirectory) ? `pages/${relative.slice(root.pagesDirectory.length)}` : "";
    const app = appPath.split("/").some((part) => part.startsWith("_")) ? null : /^app\/(.*\/)?(page|route|layout)\.[jt]sx?$/.exec(appPath);
    const pages = /^pages\/(.+)\.[jt]sx?$/.exec(pagesPath);
    const routes: RepositoryRoute[] = [];
    let role = reactRole(file, source);
    if (directive(source, "use server") || source.getDescendantsOfKind(SyntaxKind.Block).some((block) => {
      const parent = block.getParent();
      return (Node.isFunctionDeclaration(parent) || Node.isFunctionExpression(parent) || Node.isArrowFunction(parent)) && parent.isAsync() && directive(block, "use server");
    })) role = "action";
    if (app) {
      role = app[2] === "page" ? "page" : app[2] === "route" ? "api" : "layout";
      const pattern = appPattern((app[1] ?? "").split("/").filter(Boolean));
      if (root?.routesSafe && pattern !== undefined) {
        if (role === "page" && source.getDefaultExportSymbol()) routes.push({ file: file.path, method: "GET", path: (pattern === "/" ? root.basePath || "/" : `${root.basePath}${pattern}`) });
        if (role === "api") {
          for (const [name, declarations] of source.getExportedDeclarations()) {
            if (!methods.has(name)) continue;
            // A local function or arrow is syntax evidence. Re-exports and computed handlers are absent.
            if (declarations.some((declaration) => declaration.getSourceFile() === source &&
              ((Node.isFunctionDeclaration(declaration) && declaration.getBody()) || (Node.isVariableDeclaration(declaration) &&
                [SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression].includes(declaration.getInitializer()?.getKind() ?? SyntaxKind.Unknown))))) {
              routes.push({ file: file.path, method: name, path: (pattern === "/" ? root.basePath || "/" : `${root.basePath}${pattern}`) });
            }
          }
        }
      }
    } else if (pages) {
      const parts = pages[1].split("/");
      const api = parts[0] === "api";
      const special = parts.length === 1 && ["_app", "_document", "_error"].includes(parts[0]);
      if (!special) {
        role = api ? "api" : "page";
        if (parts.at(-1) === "index") parts.pop();
        const pattern = appPattern(parts, false);
        // A Pages API default handler does not declare an HTTP method.
        if (!api && root?.routesSafe && pattern !== undefined && source.getDefaultExportSymbol()) routes.push({ file: file.path, method: "GET", path: (pattern === "/" ? root.basePath || "/" : `${root.basePath}${pattern}`) });
      }
    }
    return { role, routes };
  } };
}
