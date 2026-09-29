import ts from '@typescript/typescript6';
import path from 'node:path';
import type { EditableProject } from './language-service';
import { resolveSpecifier, specifierFor, withoutExtension } from './module-paths';
import { RenameRefusedError, type RenameMapEntry, type RenamePolicy, type RenameResult } from './rename-types';

/**
 * Renames a source file (`entry.from` → `entry.to`, repo-relative paths).
 *
 * The language service rewrites import and export declarations. Module
 * strings it does not treat as imports — `vi.mock('…')`, `vi.importActual('…')`
 * and friends — are rewritten here, keeping each one's style (relative path
 * or `@/` / `@app/` alias).
 */

const MODULE_STRING = /\b(vi\.(?:mock|doMock|importActual|importMock)|require|import)\(\s*(['"`])([^'"`\n]+)\2/g;

const rewriteModuleStrings = (project: EditableProject, fromAbs: string, toAbs: string, repoRoot: string): number => {
  const oldTarget = withoutExtension(fromAbs);
  const newTarget = withoutExtension(toAbs);
  let rewritten = 0;
  for (const fileName of project.rootFiles()) {
    const text = project.readText(fileName);
    if (text === undefined) continue;
    const next = text.replace(MODULE_STRING, (match, call: string, quote: string, specifier: string) => {
      const resolved = resolveSpecifier(specifier, fileName, repoRoot);
      if (!resolved || withoutExtension(resolved) !== oldTarget) return match;
      rewritten++;
      const kept = specifier.match(/\.(tsx?|jsx?|mjs|cjs)$/)?.[0] ?? '';
      return match.replace(`${quote}${specifier}${quote}`, `${quote}${specifierFor(newTarget, fileName, specifier, repoRoot)}${kept}${quote}`);
    });
    if (next !== text) project.writeText(fileName, next);
  }
  return rewritten;
};

export const renameFile = (project: EditableProject, entry: RenameMapEntry, policy: RenamePolicy): RenameResult => {
  if (entry.persisted || !entry.to || entry.to === entry.from) throw new RenameRefusedError(entry, 'missing or unsafe target path');
  if (policy.excludedFolders.some((folder) => entry.from.startsWith(folder))) {
    throw new RenameRefusedError(entry, 'file is in an excluded folder');
  }
  const fromAbs = path.join(policy.repoRoot, entry.from);
  const toAbs = path.join(policy.repoRoot, entry.to);
  if (project.readText(toAbs) !== undefined) throw new RenameRefusedError(entry, `${entry.to} already exists`);
  if (project.readText(fromAbs) === undefined) throw new RenameRefusedError(entry, `${entry.from} does not exist`);

  const edits = project.service.getEditsForFileRename(fromAbs, toAbs, ts.getDefaultFormatCodeSettings(), {});
  for (const fileEdit of edits) {
    const text = project.readText(fileEdit.fileName);
    if (text === undefined) continue;
    const next = [...fileEdit.textChanges]
      .sort((a, b) => b.span.start - a.span.start)
      .reduce((current, change) => current.slice(0, change.span.start) + change.newText + current.slice(change.span.start + change.span.length), text);
    project.writeText(fileEdit.fileName, next);
  }
  project.moveFile(fromAbs, toAbs);
  const moduleStrings = rewriteModuleStrings(project, fromAbs, toAbs, policy.repoRoot);
  return { locations: edits.reduce((sum, edit) => sum + edit.textChanges.length, 0) + moduleStrings, stringHits: [] };
};
