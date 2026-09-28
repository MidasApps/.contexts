import ts from '@typescript/typescript6';
import type { WordClassifier } from './identifier-words';

/**
 * Finds Portuguese identifiers in one source file and says what each one is.
 *
 * Only code is read: comments, string literals, template text and JSX text are
 * never looked at, so user-facing strings and test titles cannot show up.
 *
 * Categories, most protected first:
 * - `data-key`: snake_case, dotted or quoted keys that are not identifiers —
 *   BigQuery columns, contract attribute paths, block ids. Values, never renamed.
 * - `protected`: names in `lexicon/protected-names.json` (persisted block
 *   fields, metric output columns, log fields, tool result keys).
 * - `tool-param`: properties of a zod object in an LLM tool folder. The model
 *   sees them and they are stored in chat history.
 * - `contract`: a property named like a data-contract entity or attribute.
 *   Data by default; audit each occurrence.
 * - `property`: any other property name. Renameable after a serialization audit.
 * - `local`: variables, functions, parameters, types, imports. Safe to rename.
 */

export type OccurrenceCategory = 'data-key' | 'protected' | 'tool-param' | 'contract' | 'property' | 'local';

export type Occurrence = Readonly<{
  file: string;
  line: number;
  name: string;
  category: OccurrenceCategory;
  portugueseWords: readonly string[];
  isMixed: boolean;
  /**
   * The name is declared here (variable, function, parameter, type, class,
   * destructured binding, or a property on a type or object literal), not
   * just referenced or imported. A rename map points at declarations.
   */
  isDeclaration: boolean;
}>;

export type ScanContext = Readonly<{
  classifier: WordClassifier;
  contractNames: ReadonlySet<string>;
  protectedNames: ReadonlySet<string>;
  /** Path prefixes of the LLM tool folders. */
  toolFolders: readonly string[];
}>;

const scriptKindOf = (fileName: string): ts.ScriptKind => {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (/\.(m|c)?js$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
};

const isDeclarationName = (id: ts.Identifier, parent: ts.Node): boolean =>
  (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent)
    || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) || ts.isEnumDeclaration(parent)
    || ts.isParameter(parent) || ts.isTypeParameterDeclaration(parent) || ts.isFunctionExpression(parent))
  && parent.name === id;

const isPropertyName = (id: ts.Identifier, parent: ts.Node): boolean => {
  if ((ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)
    || ts.isMethodSignature(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessor(parent)
    || ts.isSetAccessor(parent) || ts.isEnumMember(parent)) && parent.name === id) return true;
  if (ts.isShorthandPropertyAssignment(parent) || ts.isJsxAttribute(parent)) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return true;
  // `{ nome: x } = obj` reads the key `nome`. A shorthand `{ nome } = obj`
  // declares the local `nome`: renaming it keeps the key (`{ nome: name }`).
  return ts.isBindingElement(parent) && parent.propertyName === id;
};

/** Inside `z.object({...})` / `z.strictObject` / `z.looseObject`? */
const isInZodObject = (node: ts.Node): boolean => {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (!ts.isCallExpression(current)) continue;
    const callee = current.expression.getText();
    if (/^z\.(object|strictObject|looseObject)$/.test(callee)) return true;
  }
  return false;
};

/** Declares a property: on a type, class or object literal. */
const isPropertyDeclaration = (id: ts.Node, parent: ts.Node): boolean =>
  ((ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)
    || ts.isMethodSignature(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessor(parent)
    || ts.isSetAccessor(parent) || ts.isEnumMember(parent)) && parent.name === id)
  || ts.isShorthandPropertyAssignment(parent);

/** Declares a local binding: `const`, `function`, parameter, type, class, destructured name. */
const isLocalDeclaration = (id: ts.Identifier, parent: ts.Node): boolean =>
  isDeclarationName(id, parent) || (ts.isBindingElement(parent) && parent.name === id);

const isDataKey = (name: string, quoted: boolean): boolean =>
  (name.includes('_') && name === name.toLowerCase()) || name.includes('.') || (quoted && !/^[A-Za-z_$][\w$]*$/.test(name));

const categoryOf = (
  args: Readonly<{ name: string; quoted: boolean; isProperty: boolean; inZod: boolean; file: string }>,
  context: ScanContext,
): OccurrenceCategory => {
  if (isDataKey(args.name, args.quoted)) return 'data-key';
  if (context.protectedNames.has(args.name)) return 'protected';
  if (!args.isProperty) return 'local';
  if (args.inZod && context.toolFolders.some((folder) => args.file.startsWith(folder))) return 'tool-param';
  if (context.contractNames.has(args.name)) return 'contract';
  return 'property';
};

export const scanSource = (
  args: Readonly<{ file: string; text: string }>,
  context: ScanContext,
): Occurrence[] => {
  const sourceFile = ts.createSourceFile(args.file, args.text, ts.ScriptTarget.Latest, true, scriptKindOf(args.file));
  const found: Occurrence[] = [];

  const record = (node: ts.Node, name: string, isProperty: boolean, quoted: boolean, isDeclaration: boolean): void => {
    const analysis = context.classifier.analyzeIdentifier(name);
    if (analysis.portugueseWords.length === 0) return;
    const inZod = isProperty && isInZodObject(node);
    found.push({
      file: args.file,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      name,
      category: categoryOf({ name, quoted, isProperty, inZod, file: args.file }, context),
      portugueseWords: analysis.portugueseWords,
      isMixed: analysis.isMixed,
      isDeclaration,
    });
  };

  const visit = (node: ts.Node): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && parent) {
      const isProperty = !isDeclarationName(node, parent) && isPropertyName(node, parent);
      // `{ nome } = obj` both reads the key and declares a local; as a local it is a declaration.
      const isDeclaration = isProperty ? isPropertyDeclaration(node, parent) : isLocalDeclaration(node, parent);
      record(node, node.text, isProperty, false, isDeclaration);
    } else if (ts.isStringLiteral(node) && parent
      && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) {
      record(node, node.text, true, true, true);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

/** Portuguese words in a file's base name (`serie-do-kpi.test.ts` → `serie`). */
export const portugueseWordsInFileName = (file: string, classifier: WordClassifier): readonly string[] => {
  const baseName = file.split('/').at(-1) ?? file;
  const stem = baseName.replace(/(\.(test|spec))?\.[^.]+$/, '');
  return classifier.analyzeIdentifier(stem).portugueseWords;
};
