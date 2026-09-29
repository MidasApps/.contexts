import ts from '@typescript/typescript6';

/**
 * Proves a rename batch changed no string and no serialized key.
 *
 * A fingerprint is three multisets taken from one file:
 * - `literals`: string and template-text values (module specifiers left out,
 *   since file renames rewrite them);
 * - `jsxText`: text between JSX tags;
 * - `keys`: property names in object literals, interfaces and type literals,
 *   class fields, destructuring patterns and JSX attributes.
 *
 * Keys inside a `vi.mock` / `vi.doMock` factory are left out: they name the
 * mocked module's exports, which the rename codemod keeps in step with the
 * export (test plumbing, not serialized data).
 *
 * Test titles (the first argument of `describe` / `it` / `test`) are a fourth
 * multiset, `testTitles`. A title often starts with the function it tests
 * (`'serieMensalDoKpi — recusas'`), and that name may follow the rename. Only
 * compound identifiers (camelCase or `CONSTANT_CASE`) are swapped: a plain
 * word such as `nome` is also prose, and prose must not change.
 *
 * Comparing the fingerprint of a file before and after a batch fails if any
 * literal or JSX text changed, and if any key changed that the batch map does
 * not rename as a property. That turns "no behavior change" into a mechanical
 * check: a renamed local cannot touch either multiset, and a renamed property
 * shows up in `keys` and must be in the map.
 */

export type Fingerprint = Readonly<{
  literals: readonly string[];
  jsxText: readonly string[];
  keys: readonly string[];
  testTitles: readonly string[];
}>;

export type RenamePairs = Readonly<{
  /** Every `from → to` of the batch (locals, props and identifier-reference strings). */
  names: ReadonlyMap<string, string>;
  /** `from → to` of property renames (`kind: 'prop'`). */
  properties: ReadonlyMap<string, string>;
}>;

const MODULE_CALLS = /^(require|import|vi\.mock|vi\.doMock|vi\.importActual|vi\.importMock|jest\.mock)$/;

const isModuleSpecifier = (node: ts.StringLiteral): boolean => {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) return true;
  return ts.isCallExpression(parent) && parent.arguments[0] === node
    && (parent.expression.kind === ts.SyntaxKind.ImportKeyword || MODULE_CALLS.test(parent.expression.getText()));
};

const TEST_CALL = /^(describe|it|test)(\.(only|skip|todo|concurrent|sequential))*$/;

const isTestTitle = (node: ts.Node): boolean =>
  node.parent !== undefined && ts.isCallExpression(node.parent) && node.parent.arguments[0] === node
  && TEST_CALL.test(node.parent.expression.getText());

const keyText = (name: ts.Node | undefined): string | null => {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
};

const propertyKeyOf = (node: ts.Node): string | null => {
  if (ts.isPropertyAssignment(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)
    || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
    return keyText(node.name);
  }
  if (ts.isShorthandPropertyAssignment(node)) return node.name.text;
  if (ts.isJsxAttribute(node)) return keyText(node.name);
  // A rest element (`{ a, ...rest }`) names a local, not a key.
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken) {
    // `{ [key]: local }`: a computed key is not a literal key, and `local` is a binding.
    if (node.propertyName) return keyText(node.propertyName);
    return keyText(node.name);
  }
  return null;
};

const scriptKindOf = (fileName: string): ts.ScriptKind => {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (/\.(m|c)?js$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
};

export const fingerprintSource = (fileName: string, text: string): Fingerprint => {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKindOf(fileName));
  const literals: string[] = [];
  const jsxText: string[] = [];
  const keys: string[] = [];
  const testTitles: string[] = [];
  const visit = (node: ts.Node, inMockFactory = false): void => {
    // A quoted key (`{ 'total geral': 1 }`) is a key, not a literal.
    const isKeyName = node.parent !== undefined && propertyKeyOf(node.parent) !== null
      && (node.parent as { name?: ts.Node }).name === node;
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isTestTitle(node)) testTitles.push(node.text);
    else if (ts.isStringLiteral(node) && !isModuleSpecifier(node) && !isKeyName) literals.push(node.text);
    else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) literals.push(node.text);
    else if (ts.isJsxText(node) && node.text.trim()) jsxText.push(node.text.trim());
    const key = propertyKeyOf(node);
    if (key !== null && !inMockFactory) keys.push(key);
    const isMockCall = ts.isCallExpression(node) && /^vi\.(mock|doMock)$/.test(node.expression.getText());
    ts.forEachChild(node, (child) => visit(child, inMockFactory || (isMockCall && child === (node as ts.CallExpression).arguments[1])));
  };
  visit(sourceFile);
  return { literals: literals.sort(), jsxText: jsxText.sort(), keys: keys.sort(), testTitles: testTitles.sort() };
};

const countOf = (values: readonly string[]): Map<string, number> =>
  values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>());

/** Values whose count differs between the two multisets, with the signed difference. */
const multisetDiff = (before: readonly string[], after: readonly string[]): Map<string, number> => {
  const beforeCounts = countOf(before);
  const afterCounts = countOf(after);
  const diff = new Map<string, number>();
  for (const value of new Set([...beforeCounts.keys(), ...afterCounts.keys()])) {
    const delta = (afterCounts.get(value) ?? 0) - (beforeCounts.get(value) ?? 0);
    if (delta !== 0) diff.set(value, delta);
  }
  return diff;
};

/**
 * A difference is explained when every removed value was renamed by the map
 * to an added value, with matching counts.
 */
const unexplained = (diff: ReadonlyMap<string, number>, renames: ReadonlyMap<string, string>): string[] => {
  const remaining = new Map(diff);
  for (const [from, delta] of diff) {
    const to = renames.get(from);
    if (delta >= 0 || to === undefined) continue;
    const added = remaining.get(to) ?? 0;
    const moved = Math.min(-delta, added);
    remaining.set(from, delta + moved);
    remaining.set(to, added - moved);
  }
  return [...remaining].filter(([, delta]) => delta !== 0).map(([value, delta]) => `${delta > 0 ? '+' : ''}${delta} ${JSON.stringify(value)}`);
};

const isCompoundIdentifier = (name: string): boolean => /[A-Z_]/.test(name) && /^[A-Za-z_$][\w$]*$/.test(name);

/** The title with every renamed compound identifier swapped for its new name. */
const renameInTitle = (title: string, names: ReadonlyMap<string, string>): string =>
  title.replace(/[A-Za-z_$][\w$]*/g, (word) => (isCompoundIdentifier(word) ? names.get(word) ?? word : word));

export type FingerprintViolation = Readonly<{ kind: 'literal' | 'jsx-text' | 'key' | 'test-title'; change: string }>;

export const compareFingerprints = (
  before: Fingerprint,
  after: Fingerprint,
  renames: RenamePairs,
): FingerprintViolation[] => [
  // A literal may change only when it names a renamed identifier (`vi.spyOn(mod, 'old')`).
  ...unexplained(multisetDiff(before.literals, after.literals), renames.names).map((change) => ({ kind: 'literal' as const, change })),
  ...unexplained(multisetDiff(before.jsxText, after.jsxText), new Map()).map((change) => ({ kind: 'jsx-text' as const, change })),
  ...unexplained(multisetDiff(before.keys, after.keys), renames.properties).map((change) => ({ kind: 'key' as const, change })),
  ...unexplained(multisetDiff(before.testTitles.map((title) => renameInTitle(title, renames.names)), after.testTitles), new Map())
    .map((change) => ({ kind: 'test-title' as const, change })),
];
