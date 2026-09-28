#!/usr/bin/env tsx
/**
 * Applies a batch rename map (`list-pt-identifiers --out`, filled by a person)
 * to the repo, all or nothing.
 *
 * Usage (from the repo root):
 *   pnpm tsx --tsconfig tsconfig.scripts.json scripts/codemods/apply-rename-map.ts \
 *     --map scripts/codemods/maps/task-01.json [--dry-run] [--include-mjs]
 *
 * Entries run in map order against an in-memory copy of the project. If any
 * entry is refused (persisted, unaudited property, protected name, name
 * collision, excluded folder, JSON edit), nothing is written. Otherwise files
 * are moved on disk and edited files are written. Nothing is staged: `git mv`
 * put the moves in the index, and a later commit of unrelated paths (or an
 * `--amend`) carried them along twice. `git add` still records them as
 * renames. Strings equal to an old name are listed for review; they are
 * never changed.
 *
 * Then run the batch checks: tsc, lint, the full test suite, build, and
 * `check-fingerprint --base <ref> --map <map>`.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import protectedNamesData from './lexicon/protected-names.json';
import { loadRepoProject } from './language-service';
import { renameFile } from './rename-file';
import { renameIdentifier } from './rename-identifiers';
import type { RenameMapEntry, RenamePolicy } from './rename-types';

const valueOf = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};

const main = (): void => {
  const argv = process.argv.slice(2);
  const mapFile = valueOf(argv, '--map');
  if (!mapFile) {
    console.error('Usage: apply-rename-map --map <map.json> [--dry-run] [--include-mjs]');
    process.exit(2);
  }
  const repoRoot = process.cwd();
  const entries = JSON.parse(readFileSync(mapFile, 'utf8')) as RenameMapEntry[];
  const policy: RenamePolicy = {
    repoRoot,
    protectedNames: new Set(Object.values(protectedNamesData.groups).flat()),
    excludedFolders: protectedNamesData.excludedFolders,
  };

  const startedAt = Date.now();
  const project = loadRepoProject(repoRoot, argv.includes('--include-mjs'));
  const stringHits: string[] = [];
  for (const entry of entries) {
    try {
      const result = entry.kind === 'file' ? renameFile(project, entry, policy) : renameIdentifier(project, entry, policy);
      console.log(result.alreadyApplied
        ? `skip ${entry.kind} ${entry.from} -> ${entry.to} (already renamed by an earlier entry)`
        : `ok   ${entry.kind} ${entry.from} -> ${entry.to} (${result.locations} edits)`);
      stringHits.push(...result.stringHits.map((hit) => `${hit}  '${entry.from}'`));
    } catch (error: unknown) {
      console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
      console.error('Nothing was written.');
      process.exit(1);
    }
  }

  if (stringHits.length > 0) {
    console.log('\nStrings equal to an old name (review by hand; unchanged):');
    for (const hit of stringHits) console.log(`  ${hit}`);
  }

  const changed = [...project.changedFiles().keys()].map((file) => path.relative(repoRoot, file));
  console.log(`\n${changed.length} file(s) changed, ${project.movedFiles().length} moved, in ${Math.round((Date.now() - startedAt) / 1000)} s.`);
  if (argv.includes('--dry-run')) {
    console.log('Dry run: nothing written.');
    return;
  }
  for (const [from, to] of project.movedFiles()) {
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(from, to);
  }
  for (const [file, text] of project.changedFiles()) writeFileSync(file, text);
  console.log('Written. Now run tsc, lint, the full tests, build and check-fingerprint.');
};

if (process.argv[1]?.endsWith('apply-rename-map.ts')) main();
