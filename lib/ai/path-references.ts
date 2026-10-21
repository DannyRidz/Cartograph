import { ts } from "ts-morph";

export interface PathReferences {
  externalSpecifiers: string[];
  codeSymbols: string[];
  moduleSpecifiers?: string[];
}

/** These are source references, never extra allowed repository paths or edges. */
export function pathReferences(sources: readonly { path: string; source: string }[], externalSpecifiers: readonly string[] = []): PathReferences {
  const external = new Set<string>();
  const allowedExternal = new Set(externalSpecifiers);
  const modules = new Set<string>();
  const symbols = new Set<string>();
  for (const source of sources) {
    const kind = /\.[cm]?jsx?$/.test(source.path) ? ts.ScriptKind.JSX : /\.tsx$/.test(source.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(source.path, source.source, ts.ScriptTarget.Latest, true, kind);
    const specifier = (node: ts.Node | undefined) => {
      // Resolution belongs to the parser. A bare specifier can be a tsconfig
      // alias, so syntax alone cannot prove that it is an external package.
      if (!node || !ts.isStringLiteralLike(node)) return;
      if (allowedExternal.has(node.text)) external.add(node.text);
      // A bare source specifier without a filename component can be discussed
      // as a module name even when dependency installation prevented resolution.
      // This establishes no file or edge. File-shaped aliases remain checked.
      else if (!/^(?:\.|\/|[A-Za-z]:|@\/|~\/|#)/.test(node.text)
        && !/(?:^|\/)\.?(?:[^/]+\.)[^/]+$/.test(node.text)) modules.add(node.text);
    };
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier(node.moduleSpecifier);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier(node.argument.literal);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) specifier(node.arguments[0]);
      if (ts.isPropertyAccessExpression(node) || ts.isQualifiedName(node)) symbols.add(node.getText(ast));
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return { externalSpecifiers: [...external].sort(), moduleSpecifiers: [...modules].sort(), codeSymbols: [...symbols].sort() };
}
