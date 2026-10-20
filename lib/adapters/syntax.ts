import { Node, SyntaxKind, type SourceFile } from "ts-morph";

export function literal(node: Node | undefined): string | undefined {
  return node && (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) ? node.getLiteralValue() : undefined;
}
export function directive(source: Node, text: string): boolean {
  if (!Node.isSourceFile(source) && !Node.isBlock(source)) return false;
  for (const statement of source.getStatements()) {
    if (!Node.isExpressionStatement(statement)) break;
    const value = literal(statement.getExpression());
    if (value === undefined) break;
    if (value === text) return true;
  }
  return false;
}
export function importedName(source: SourceFile, expression: Node, module: string): string | undefined {
  if (!Node.isIdentifier(expression) && !Node.isPropertyAccessExpression(expression)) return undefined;
  const identifier = Node.isIdentifier(expression) ? expression : expression.getExpression();
  if (!Node.isIdentifier(identifier)) return undefined;
  // Resolve the declaration, so a local lookalike or shadowed name is never a decorator match.
  const declaration = identifier.getSymbol()?.getDeclarations()[0];
  if (declaration && Node.isImportSpecifier(declaration) && Node.isIdentifier(expression)) {
    const imp = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
    if (imp.getModuleSpecifierValue() === module && !imp.isTypeOnly() && !declaration.isTypeOnly()) return declaration.getName();
  }
  if (declaration && Node.isNamespaceImport(declaration) && Node.isPropertyAccessExpression(expression)) {
    const imp = source.getImportDeclarations().find((entry) => entry.getNamespaceImport() === declaration.getNameNode());
    if (imp?.getModuleSpecifierValue() === module && !imp.isTypeOnly()) return expression.getName();
  }
  return undefined;
}
