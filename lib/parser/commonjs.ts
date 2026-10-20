import { Node, SyntaxKind, ts, type SourceFile, type Node as SyntaxNode } from "ts-morph";

// A locally declared require, module or exports is not evidence of CommonJS.
function globalName(node: SyntaxNode | undefined, name: string): boolean {
  return !!node && Node.isIdentifier(node) && node.getText() === name
    && !node.getSymbolsInScope(ts.SymbolFlags.Value).find((symbol) => symbol.getName() === name)
      ?.getDeclarations().some((declaration) => Node.isVariableDeclaration(declaration)
        || Node.isParameterDeclaration(declaration) || Node.isBindingElement(declaration)
        || Node.isFunctionDeclaration(declaration) || Node.isClassDeclaration(declaration)
        || Node.isImportSpecifier(declaration) || Node.isImportClause(declaration)
        || Node.isNamespaceImport(declaration) || Node.isImportEqualsDeclaration(declaration));
}

function property(node: SyntaxNode): { owner: SyntaxNode; name: string } | undefined {
  if (Node.isPropertyAccessExpression(node)) return { owner: node.getExpression(), name: node.getName() };
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    if (argument && Node.isStringLiteral(argument)) return { owner: node.getExpression(), name: argument.getLiteralValue() };
  }
}

function moduleExports(node: SyntaxNode): boolean {
  const access = property(node);
  return !!access && access.name === "exports" && globalName(access.owner, "module");
}

export function isRequire(node: SyntaxNode): boolean {
  return globalName(node, "require");
}

export function commonJsExports(source: SourceFile): { isModule: boolean; names: string[] } {
  const names = new Set<string>();
  let isModule = false;
  for (const assignment of source.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
    const left = assignment.getLeft();
    if (moduleExports(left)) {
      isModule = true;
      const right = assignment.getRight();
      if (Node.isObjectLiteralExpression(right)) {
        for (const member of right.getProperties()) {
          if (Node.isSpreadAssignment(member)) continue;
          const name = member.getNameNode();
          if (Node.isIdentifier(name) || Node.isStringLiteral(name) || Node.isNumericLiteral(name)) {
            names.add(Node.isIdentifier(name) ? name.getText() : name.getLiteralText());
          } else if (Node.isComputedPropertyName(name)) {
            const expression = name.getExpression();
            if (Node.isStringLiteral(expression)) names.add(expression.getLiteralValue());
          }
        }
      } else {
        // The exported value itself has no recoverable member names.
        names.add("default");
      }
    } else {
      const access = property(left);
      if (access && (globalName(access.owner, "exports") || moduleExports(access.owner))) {
        isModule = true;
        names.add(access.name);
      }
    }
  }
  return { isModule, names: [...names].sort() };
}
