#!/usr/bin/env tsx
/**
 * Fails a rename batch that changed a string literal, JSX text or a property
 * key the batch map does not rename. See `fingerprint.ts`.
 *
 * Usage (from the repo root):
 *   pnpm tsx --tsconfig tsconfig.scripts.json scripts/codemods/check-fingerprint.ts \
 *     --base origin/main [--head <ref>] [--map scripts/codemods/maps/task-01.json]
 *
 * Without `--head`, the working tree is compared with `--base`. Renamed files
 * are followed (`git diff -M`); added and deleted files are listed but not
 * compared. Exits 1 on any violation.
 *
 * `apply-rename-map` moves files without staging them, and `git diff` does not
 * see untracked files: a moved file would show up only as deleted, and pass
 * unchecked. So the working-tree mode refuses to run while a source file is
 * untracked. `git add` the batch paths first, or commit and pass `--head`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compareFingerprints, fingerprintSource, type RenamePairs } from './fingerprint';

type MapEntry = Readonly<{ from: string; to: string; kind: 'local' | 'prop' | 'file' }>;

type ChangedFile = Readonly<{ status: string; before: string; after: string }>;

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

const git = (args: readonly string[]): string => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const changedFiles = (base: string, head: string | undefined): ChangedFile[] =>
  git(['diff', '-M', '--name-status', base, ...(head ? [head] : [])])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status = '', before = '', after = before] = line.split('\t');
      return { status: status[0] ?? '', before, after };
    })
    .filter((file) => SOURCE_FILE.test(file.after));

const readAt = (ref: string | undefined, file: string): string =>
  ref ? git(['show', `${ref}:${file}`]) : readFileSync(file, 'utf8');

export const renamePairsFromMap = (entries: readonly MapEntry[]): RenamePairs => {
  const identifiers = entries.filter((entry) => entry.kind !== 'file' && entry.to);
  return {
    names: new Map(identifiers.map((entry) => [entry.from, entry.to])),
    properties: new Map(identifiers.filter((entry) => entry.kind === 'prop').map((entry) => [entry.from, entry.to])),
  };
};

const valueOf = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};

const main = (): void => {
  const argv = process.argv.slice(2);
  const base = valueOf(argv, '--base');
  if (!base) {
    console.error('Usage: check-fingerprint --base <ref> [--head <ref>] [--map <map.json>]');
    process.exit(2);
  }
  const head = valueOf(argv, '--head');
  const mapFile = valueOf(argv, '--map');
  const renames = renamePairsFromMap(mapFile ? (JSON.parse(readFileSync(mapFile, 'utf8')) as MapEntry[]) : []);

  const untracked = head ? [] : git(['ls-files', '--others', '--exclude-standard'])
    .split('\n').filter((file) => SOURCE_FILE.test(file));
  if (untracked.length > 0) {
    console.error(`Untracked source files (a moved file would pass unchecked):\n  ${untracked.join('\n  ')}`);
    console.error('git add the batch paths first, or commit and pass --head.');
    process.exit(2);
  }

  let violations = 0;
  for (const file of changedFiles(base, head)) {
    if (file.status === 'A' || file.status === 'D') {
      console.log(`skip ${file.status} ${file.after}`);
      continue;
    }
    const found = compareFingerprints(
      fingerprintSource(file.before, readAt(base, file.before)),
      fingerprintSource(file.after, readAt(head, file.after)),
      renames,
    );
    for (const violation of found) console.log(`${file.after}: ${violation.kind} ${violation.change}`);
    violations += found.length;
  }
  console.log(violations === 0 ? 'fingerprint ok' : `fingerprint FAILED: ${violations} change(s)`);
  if (violations > 0) process.exit(1);
};

if (process.argv[1]?.endsWith('check-fingerprint.ts')) main();
