import { Node, type SourceFile, type Decorator } from "ts-morph";
import { fallbackAdapter, type RepositoryAdapter } from "../parser/adapter.ts";
import type { RepositoryRoute } from "../parser/types.ts";
import { importedName, literal } from "./syntax.ts";

const modifiedRepositories = new WeakMap<SourceFile[], boolean>();
const verbs: Record<string, string> = { Get: "GET", Post: "POST", Put: "PUT", Patch: "PATCH", Delete: "DELETE", Head: "HEAD", Options: "OPTIONS" };
function decoratorName(decorator: Decorator): string | undefined {
  const call = decorator.getCallExpression();
  return call ? importedName(decorator.getSourceFile(), call.getExpression(), "@nestjs/common") : undefined;
}
function paths(decorator: Decorator): string[] | undefined {
  const args = decorator.getCallExpression()?.getArguments();
  if (!args || args.length > 1) return undefined;
  if (!args.length) return [""];
  const argument = args[0];
  const value = literal(argument);
  if (value !== undefined) return [value];
  if (Node.isArrayLiteralExpression(argument)) {
    const values = argument.getElements().map(literal);
    if (values.every((entry): entry is string => entry !== undefined)) return values;
  }
  return undefined;
}

export const nestjsAdapter: RepositoryAdapter = {
  ...fallbackAdapter, name: "nestjs",
  inspect(file, source, sources) {
    const suffix = /\.(controller|service|module|entity|guard|interceptor|pipe|filter)\.[cm]?[jt]s$/.exec(file.path)?.[1];
    const role = suffix ?? (file.isModule ? "other" : "script");
    const routes: RepositoryRoute[] = [];
    // These application-level features alter every controller's full pattern.
    // Until their complete configuration is recoverable, no partial paths are emitted.
    let modifiesRoutes = modifiedRepositories.get(sources);
    if (modifiesRoutes === undefined) modifiesRoutes = sources.some((entry) => entry.getDescendants().some((node) => {
      if (Node.isPropertyAccessExpression(node)) {
        if (["setGlobalPrefix", "enableVersioning"].includes(node.getName())) return true;
        return node.getName() === "register" && importedName(entry, node.getExpression(), "@nestjs/core") === "RouterModule";
      }
      if (Node.isElementAccessExpression(node)) {
        const name = literal(node.getArgumentExpression());
        return name !== undefined && ["setGlobalPrefix", "enableVersioning"].includes(name);
      }
      return false;
    }));
    modifiedRepositories.set(sources, modifiesRoutes);
    if (modifiesRoutes) return { role, routes };
    for (const controller of source.getClasses()) {
      const decorators = controller.getDecorators().filter((entry) => decoratorName(entry) === "Controller");
      if (decorators.length !== 1 || controller.getExtends()) continue;
      const prefixes = paths(decorators[0]);
      if (!prefixes) continue;
      for (const method of controller.getMethods()) {
        if (method.isStatic() || !method.getBody()) continue;
        const decorators = method.getDecorators();
        if (decorators.some((entry) => decoratorName(entry) === "Version")) continue;
        const handlers = decorators.filter((entry) => verbs[decoratorName(entry) ?? ""] || decoratorName(entry) === "All");
        if (handlers.length !== 1) continue;
        const verb = verbs[decoratorName(handlers[0]) ?? ""];
        const patterns = paths(handlers[0]);
        if (!verb || !patterns) continue;
        for (const prefix of prefixes) for (const pattern of patterns) {
          // Keep parameter and wildcard spelling. Only boundary slashes are normalized.
          const path = `/${[prefix, pattern].map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
          routes.push({ file: file.path, method: verb, path });
        }
      }
    }
    return { role, routes };
  },
};
