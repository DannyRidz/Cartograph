import { SyntaxKind, type SourceFile } from "ts-morph";
import { fallbackAdapter, type AdapterFile, type RepositoryAdapter } from "../parser/adapter.ts";

export function reactRole(file: AdapterFile, source: SourceFile): string {
  if (source.getDescendants().some((node) => [SyntaxKind.JsxElement, SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxFragment].includes(node.getKind()))) return "component";
  if (/^use[A-Z]/.test(file.path.split("/").at(-1) ?? "")) return "hook";
  return file.isModule ? "module" : "script";
}
export const reactAdapter: RepositoryAdapter = {
  ...fallbackAdapter, name: "react",
  inspect(file, source) { return { role: reactRole(file, source), routes: [] }; },
};
