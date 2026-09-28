import ts from '@typescript/typescript6';
import type { EditableProject } from './language-service';
import { resolveSpecifier, withoutExtension } from './module-paths';

/**
 * Renames an export's key in the `vi.mock` / `vi.doMock` factories that mock
 * its module.
 *
 * `vi.mock('@/shared/lib/metrics/chat-metric', () => ({ gravaMetricaDoChat: … }))`
 * names the export as an object key the language service does not link to the
 * symbol. Left alone, the mocked module stops exporting the name the code
 * imports, and every test of that module fails. Only the object the factory
 * returns is touched, never nested objects.
 */

const MOCK_CALL = /^vi\.(mock|doMock)$/;

/** The object literal a factory returns: `() => ({…})`, `async () => ({…})` or `{ return {…}; }`. */
const returnedObject = (factory: ts.Expression): ts.ObjectLiteralExpression | null => {
  if (!ts.isArrowFunction(factory) && !ts.isFunctionExpression(factory)) return null;
  const unwrap = (expression: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
  if (!ts.isBlock(factory.body)) {
    const body = unwrap(factory.body);
    return ts.isObjectLiteralExpression(body) ? body : null;
  }
  const returned = factory.body.statements.find(ts.isReturnStatement)?.expression;
  const body = returned ? unwrap(returned) : null;
  return body && ts.isObjectLiteralExpression(body) ? body : null;
};

type Edit = Readonly<{ start: number; end: number; text: string }>;

const keyEdits = (object: ts.ObjectLiteralExpression, from: string, to: string, sourceFile: ts.SourceFile): Edit[] =>
  object.properties.flatMap((property): Edit[] => {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === from) {
      return [{ start: property.name.getStart(sourceFile), end: property.name.getEnd(), text: `${to}: ${from}` }];
    }
    const name = ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) ? property.name : null;
    if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === from) {
      const quote = ts.isStringLiteral(name) ? name.getText(sourceFile)[0] : '';
      return [{ start: name.getStart(sourceFile), end: name.getEnd(), text: `${quote}${to}${quote}` }];
    }
    return [];
  });

export const renameMockFactoryKeys = (
  project: EditableProject,
  args: Readonly<{ declaringFile: string; from: string; to: string; repoRoot: string }>,
): number => {
  const target = withoutExtension(args.declaringFile);
  let renamed = 0;
  for (const fileName of project.rootFiles()) {
    const text = project.readText(fileName);
    if (text === undefined || !text.includes('vi.') || !text.includes(args.from)) continue;
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const edits: Edit[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && MOCK_CALL.test(node.expression.getText(sourceFile))) {
        const [specifier, factory] = node.arguments;
        const resolved = specifier && ts.isStringLiteral(specifier) ? resolveSpecifier(specifier.text, fileName, args.repoRoot) : null;
        const object = factory ? returnedObject(factory) : null;
        if (resolved && withoutExtension(resolved) === target && object) edits.push(...keyEdits(object, args.from, args.to, sourceFile));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (edits.length === 0) continue;
    const next = [...edits].sort((a, b) => b.start - a.start).reduce((current, edit) => current.slice(0, edit.start) + edit.text + current.slice(edit.end), text);
    project.writeText(fileName, next);
    renamed += edits.length;
  }
  return renamed;
};
