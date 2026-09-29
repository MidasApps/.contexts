#!/usr/bin/env tsx
/**
 * Lists Portuguese identifiers in a scope and drafts a rename map for a batch
 * of the migration plan (`docs/plans/2026-09-25-english-identifiers.md`).
 *
 * Usage (from the repo root):
 *   pnpm tsx --tsconfig tsconfig.scripts.json scripts/codemods/list-pt-identifiers.ts \
 *     --scope src/shared/lib/metrics [--scope ...] [--summary] [--out scripts/codemods/maps/task-01.json] [--fail-on-any]
 *
 * `--summary` prints totals by category and area. `--out` writes the draft map:
 * one entry per DECLARATION in the scope (a name declared in two functions is
 * two symbols, two entries), with `to` left empty for a person to fill from
 * `vocabulary.json`. Names used in the scope but declared outside it belong to
 * their own module's batch; the summary lists them as `declaredOutsideScope`. Properties come out with `needsAudit: true`: the
 * rename tool refuses them until someone checks they are never serialized.
 * `--fail-on-any` exits 1 when a renameable name exists (a guard for folders
 * outside ESLint).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import contractVocabulary from './lexicon/contract-vocabulary.json';
import protectedNamesData from './lexicon/protected-names.json';
import { defaultWordClassifier } from './identifier-words';
import { portugueseWordsInFileName, scanSource, type Occurrence, type ScanContext } from './scan-identifiers';

export type DraftMapEntry = {
  file: string;
  line: number;
  from: string;
  to: string;
  kind: 'local' | 'prop' | 'file';
  persisted: false;
  needsAudit: boolean;
  occurrences: number;
  note?: string;
};

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const RENAMEABLE = new Set(['local', 'property']);

export const scanContext: ScanContext = {
  classifier: defaultWordClassifier,
  contractNames: new Set(contractVocabulary.names),
  protectedNames: new Set(Object.values(protectedNamesData.groups).flat()),
  toolFolders: protectedNamesData.toolFolders,
};

const isExcluded = (file: string): boolean =>
  protectedNamesData.excludedFolders.some((folder) => file.startsWith(folder));

export const listSourceFiles = (scopes: readonly string[]): string[] =>
  execFileSync('git', ['ls-files', '--', ...scopes], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => SOURCE_FILE.test(file) && !file.endsWith('.d.ts') && !isExcluded(file));

export const scanFiles = (files: readonly string[]): Occurrence[] =>
  files.flatMap((file) => scanSource({ file, text: readFileSync(file, 'utf8') }, scanContext));

/** One entry per renameable declaration, with the number of occurrences of its name in scope. */
export const draftMap = (occurrences: readonly Occurrence[], files: readonly string[]): DraftMapEntry[] => {
  const renameable = occurrences.filter((occurrence) => RENAMEABLE.has(occurrence.category));
  const countByName = renameable.reduce((counts, o) => counts.set(o.name, (counts.get(o.name) ?? 0) + 1), new Map<string, number>());
  const declarations = renameable.filter((occurrence) => occurrence.isDeclaration);
  const seen = new Set<string>();
  const entries = declarations.flatMap((occurrence): DraftMapEntry[] => {
    const kind = occurrence.category === 'local' ? 'local' : 'prop';
    const key = `${kind}:${occurrence.file}:${occurrence.line}:${occurrence.name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      file: occurrence.file,
      line: occurrence.line,
      from: occurrence.name,
      to: '',
      kind,
      persisted: false,
      needsAudit: kind === 'prop',
      occurrences: countByName.get(occurrence.name) ?? 1,
      ...(occurrence.isMixed ? { note: 'mixed-language' } : {}),
    }];
  });
  const fileEntries = files
    .filter((file) => portugueseWordsInFileName(file, scanContext.classifier).length > 0)
    .map((file): DraftMapEntry => ({
      file, line: 0, from: file, to: '', kind: 'file', persisted: false, needsAudit: false, occurrences: 1,
    }));
  return [...entries, ...fileEntries];
};

const areaOf = (file: string): string => {
  const parts = file.split('/');
  return parts[0] === 'src' ? parts.slice(0, 2).join('/') : parts[0]!;
};

export const summarize = (occurrences: readonly Occurrence[], files: readonly string[]): Record<string, unknown> => {
  const renameable = occurrences.filter((o) => RENAMEABLE.has(o.category));
  const countBy = (keyOf: (o: Occurrence) => string, list: readonly Occurrence[]): Record<string, number> =>
    list.reduce<Record<string, number>>((acc, o) => ({ ...acc, [keyOf(o)]: (acc[keyOf(o)] ?? 0) + 1 }), {});
  const namesBy = (keyOf: (o: Occurrence) => string): Record<string, number> => {
    const sets = new Map<string, Set<string>>();
    for (const o of renameable) sets.set(keyOf(o), (sets.get(keyOf(o)) ?? new Set()).add(o.name));
    return Object.fromEntries([...sets].map(([key, names]) => [key, names.size]));
  };
  return {
    files: files.length,
    renameableNames: new Set(renameable.map((o) => o.name)).size,
    renameableOccurrences: renameable.length,
    filesWithRenames: new Set(renameable.map((o) => o.file)).size,
    mixedLanguageNames: new Set(renameable.filter((o) => o.isMixed).map((o) => o.name)).size,
    declaredOutsideScope: [...new Set(renameable.map((o) => o.name))]
      .filter((name) => !renameable.some((o) => o.name === name && o.isDeclaration))
      .sort(),
    portugueseFileNames: files.filter((file) => portugueseWordsInFileName(file, scanContext.classifier).length > 0).length,
    occurrencesByCategory: countBy((o) => o.category, occurrences),
    renameableNamesByArea: namesBy((o) => areaOf(o.file)),
  };
};

const valuesOf = (argv: readonly string[], flag: string): string[] =>
  argv.flatMap((arg, i) => (arg === flag && argv[i + 1] ? [argv[i + 1]!] : []));

const main = (): void => {
  const argv = process.argv.slice(2);
  const scopes = valuesOf(argv, '--scope');
  if (scopes.length === 0) {
    console.error('Usage: list-pt-identifiers --scope <path> [--scope <path>] [--summary] [--out <file>] [--fail-on-any]');
    process.exit(2);
  }
  const files = listSourceFiles(scopes);
  const occurrences = scanFiles(files);
  const out = valuesOf(argv, '--out')[0];
  if (out) writeFileSync(out, `${JSON.stringify(draftMap(occurrences, files), null, 2)}\n`);
  if (argv.includes('--summary') || !out) console.log(JSON.stringify(summarize(occurrences, files), null, 2));
  if (argv.includes('--fail-on-any') && occurrences.some((o) => RENAMEABLE.has(o.category))) process.exit(1);
};

if (process.argv[1]?.endsWith('list-pt-identifiers.ts')) main();
