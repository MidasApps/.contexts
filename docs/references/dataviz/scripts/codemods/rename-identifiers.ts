import ts from '@typescript/typescript6';
import path from 'node:path';
import type { EditableProject } from './language-service';
import { renameMockFactoryKeys } from './mock-factories';
import { RenameRefusedError, type RenameMapEntry, type RenamePolicy, type RenameResult } from './rename-types';

/**
 * Applies one entry of a batch rename map with the TypeScript language service.
 *
 * - An identifier rename resolves the declaration at `file:line` and renames
 *   every reference, with prefix/suffix text, so a shorthand keeps its key:
 *   renaming the local `etapa` turns `{ etapa }` into `{ etapa: stage }`.
 * - It aborts when the new name already names something in scope (a local) or
 *   on the same type (a property): the compiler would not catch the shadowing.
 * - A file rename rewrites imports (language service) and the module strings
 *   the language service does not see (`vi.mock('…')`, `vi.importActual('…')`).
 * - Strings equal to the old name are reported, never changed: a person
 *   decides whether `vi.spyOn(mod, 'old')` names the identifier.
 */

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const refusalReason = (entry: RenameMapEntry, policy: RenamePolicy): string | null => {
  if (entry.persisted) return 'persisted name: needs a data migration, not a refactor';
  if (entry.needsAudit) return 'property not audited for serialization (set needsAudit: false after checking)';
  if (!entry.to || entry.to === entry.from) return 'missing target name';
  if (policy.protectedNames.has(entry.from)) return 'protected name (lexicon/protected-names.json)';
  if (policy.excludedFolders.some((folder) => entry.file.startsWith(folder))) return 'file is in an excluded folder';
  if (entry.kind !== 'file' && !IDENTIFIER.test(entry.to)) return 'target is not a valid identifier';
  return null;
};

const absolute = (policy: RenamePolicy, file: string): string =>
  path.isAbsolute(file) ? file : path.join(policy.repoRoot, file);

/** Deepest node that contains `position`. */
const nodeAt = (sourceFile: ts.SourceFile, position: number): ts.Node => {
  const descend = (node: ts.Node): ts.Node =>
    ts.forEachChild(node, (child) => (child.getStart(sourceFile) <= position && position < child.getEnd() ? descend(child) : undefined)) ?? node;
  return descend(sourceFile);
};

const findDeclarationPosition = (sourceFile: ts.SourceFile, line: number, name: string): number | null => {
  let found: number | null = null;
  const visit = (node: ts.Node): void => {
    if (found !== null) return;
    if (ts.isIdentifier(node) && node.text === name
      && sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 === line) {
      found = node.getStart(sourceFile);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

/** Type whose members the property at `node` belongs to, if any. */
const ownerTypeOf = (checker: ts.TypeChecker, node: ts.Node): ts.Type | null => {
  const parent = node.parent;
  if (!parent) return null;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return checker.getTypeAtLocation(parent.expression);
  if ((ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent)) && ts.isObjectLiteralExpression(parent.parent)) {
    return checker.getContextualType(parent.parent) ?? checker.getTypeAtLocation(parent.parent);
  }
  if ((ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)) && parent.parent) {
    return checker.getTypeAtLocation(parent.parent);
  }
  return null;
};

const collision = (
  program: ts.Program,
  entry: RenameMapEntry,
  locations: readonly ts.RenameLocation[],
  repoRoot: string,
): string | null => {
  const checker = program.getTypeChecker();
  for (const location of locations) {
    const sourceFile = program.getSourceFile(location.fileName);
    if (!sourceFile) continue;
    const node = nodeAt(sourceFile, location.textSpan.start);
    const where = `${path.relative(repoRoot, location.fileName)}:${sourceFile.getLineAndCharacterOfPosition(location.textSpan.start).line + 1}`;
    if (entry.kind === 'prop') {
      const owner = ownerTypeOf(checker, node);
      if (owner?.getProperty(entry.to)) return `property ${entry.to} already exists on the type at ${where}`;
      continue;
    }
    const meaning = ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace | ts.SymbolFlags.Alias;
    for (const symbol of checker.getSymbolsInScope(node, meaning).filter((candidate) => candidate.name === entry.to)) {
      // Shadowing an ambient global (`name`, `status` from lib.dom) is harmless
      // unless this scope uses that global; any other symbol is a collision.
      if (!isAmbientGlobal(program, symbol)) return `${entry.to} is already in scope at ${where}`;
      if (usesSymbolInScope(checker, node, symbol)) return `${entry.to} would shadow the global used at ${where}`;
    }
  }
  return null;
};

/** Is the symbol declared at `position` exported from its module? */
const isExported = (program: ts.Program, sourceFile: ts.SourceFile, position: number): boolean => {
  const symbol = program.getTypeChecker().getSymbolAtLocation(nodeAt(sourceFile, position));
  return (symbol?.declarations ?? []).some((declaration) =>
    (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0
    && declaration.getSourceFile() === sourceFile);
};

/** Declared only in the default lib or in a dependency: a global the code did not write. */
const isAmbientGlobal = (program: ts.Program, symbol: ts.Symbol): boolean =>
  (symbol.declarations ?? []).length > 0
  && (symbol.declarations ?? []).every((declaration) => {
    const file = declaration.getSourceFile();
    return program.isSourceFileDefaultLibrary(file) || file.fileName.includes('/node_modules/');
  });

/** Does the function (or file) around `node` reference `symbol`? */
const usesSymbolInScope = (checker: ts.TypeChecker, node: ts.Node, symbol: ts.Symbol): boolean => {
  let scope: ts.Node = node;
  while (scope.parent && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(current) && current.text === symbol.name && checker.getSymbolAtLocation(current) === symbol) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(scope);
  return found;
};

type TextChange = Readonly<{ start: number; length: number; newText: string }>;

const applyChanges = (text: string, changes: readonly TextChange[]): string =>
  [...changes]
    .sort((a, b) => b.start - a.start)
    .reduce((current, change) => current.slice(0, change.start) + change.newText + current.slice(change.start + change.length), text);

const writeChanges = (project: EditableProject, byFile: ReadonlyMap<string, readonly TextChange[]>): void => {
  for (const [fileName, changes] of byFile) {
    const text = project.readText(fileName);
    if (text === undefined) throw new Error(`Cannot read ${fileName}`);
    project.writeText(fileName, applyChanges(text, changes));
  }
};

const groupByFile = <T extends { fileName: string }>(items: readonly T[], toChange: (item: T) => TextChange) =>
  items.reduce((map, item) => map.set(item.fileName, [...(map.get(item.fileName) ?? []), toChange(item)]), new Map<string, TextChange[]>());

const stringHits = (project: EditableProject, name: string, repoRoot: string): string[] => {
  const quoted = new RegExp(`(['"\`])${name.replace(/[$]/g, '\\$')}\\1`);
  return project.rootFiles().flatMap((fileName) => {
    const lines = project.readText(fileName)?.split('\n') ?? [];
    return lines.flatMap((line, i) => (quoted.test(line) ? [`${path.relative(repoRoot, fileName)}:${i + 1}`] : []));
  });
};

const refuseUnsafeLocation = (entry: RenameMapEntry, policy: RenamePolicy, locations: readonly ts.RenameLocation[]): void => {
  for (const location of locations) {
    const relative = path.relative(policy.repoRoot, location.fileName);
    if (location.fileName.endsWith('.json')) throw new RenameRefusedError(entry, `would edit a JSON file (${relative})`);
    if (location.fileName.includes('/node_modules/')) throw new RenameRefusedError(entry, `would edit a dependency (${relative})`);
    if (policy.excludedFolders.some((folder) => relative.startsWith(folder))) {
      throw new RenameRefusedError(entry, `would edit an excluded folder (${relative})`);
    }
  }
};

export const renameIdentifier = (project: EditableProject, entry: RenameMapEntry, policy: RenamePolicy): RenameResult => {
  const reason = refusalReason(entry, policy);
  if (reason) throw new RenameRefusedError(entry, reason);
  const fileName = absolute(policy, entry.file);
  const program = project.service.getProgram();
  const sourceFile = program?.getSourceFile(fileName);
  if (!program || !sourceFile) throw new RenameRefusedError(entry, 'file is not in the project');
  const position = findDeclarationPosition(sourceFile, entry.line, entry.from);
  if (position === null) {
    // A property declared in several object literals is one symbol: the first
    // entry renamed all of them, so later entries find the new name already.
    if (findDeclarationPosition(sourceFile, entry.line, entry.to) !== null) return { locations: 0, stringHits: [], alreadyApplied: true };
    throw new RenameRefusedError(entry, `no identifier ${entry.from} on that line`);
  }
  const locations = project.service.findRenameLocations(fileName, position, false, false, {
    providePrefixAndSuffixTextForRename: true,
  });
  if (!locations || locations.length === 0) throw new RenameRefusedError(entry, 'the language service cannot rename it');
  refuseUnsafeLocation(entry, policy, locations);
  const clash = collision(program, entry, locations, policy.repoRoot);
  if (clash) throw new RenameRefusedError(entry, clash);

  const exported = isExported(program, sourceFile, position);
  writeChanges(project, groupByFile(locations, (location) => ({
    start: location.textSpan.start,
    length: location.textSpan.length,
    newText: `${location.prefixText ?? ''}${entry.to}${location.suffixText ?? ''}`,
  })));
  const mockKeys = exported
    ? renameMockFactoryKeys(project, { declaringFile: fileName, from: entry.from, to: entry.to, repoRoot: policy.repoRoot })
    : 0;
  return { locations: locations.length + mockKeys, stringHits: stringHits(project, entry.from, policy.repoRoot) };
};

