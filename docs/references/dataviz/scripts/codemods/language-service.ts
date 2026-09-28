import ts from '@typescript/typescript6';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A TypeScript 6 language service over the repo (or over in-memory files, in
 * tests), with edits kept in memory until the caller writes them.
 *
 * TS 7 has no programmatic API; `@typescript/typescript6` does, and parses
 * the same syntax. See `.contexts/engineering/stacks/language/typescript@7.md`.
 */

export type EditableProject = Readonly<{
  service: ts.LanguageService;
  /** Current text of a file: the in-memory edit if any, else the disk. */
  readText: (fileName: string) => string | undefined;
  writeText: (fileName: string, text: string) => void;
  moveFile: (from: string, to: string) => void;
  /** Files changed or moved since the project was created. */
  changedFiles: () => ReadonlyMap<string, string>;
  movedFiles: () => ReadonlyArray<readonly [string, string]>;
  rootFiles: () => readonly string[];
}>;

type ProjectOptions = Readonly<{
  rootFiles: readonly string[];
  compilerOptions: ts.CompilerOptions;
  currentDirectory: string;
  /** Files that exist only in memory (tests). */
  virtualFiles?: ReadonlyMap<string, string>;
}>;

export const createEditableProject = (options: ProjectOptions): EditableProject => {
  const overlay = new Map<string, string>(options.virtualFiles ?? []);
  const versions = new Map<string, number>();
  const edited = new Map<string, string>();
  const moves: Array<readonly [string, string]> = [];
  const deleted = new Set<string>();
  let roots = [...options.rootFiles];

  const readText = (fileName: string): string | undefined => {
    if (deleted.has(fileName)) return undefined;
    if (overlay.has(fileName)) return overlay.get(fileName);
    return existsSync(fileName) ? readFileSync(fileName, 'utf8') : undefined;
  };

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => roots,
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName) => {
      const text = readText(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => options.currentDirectory,
    getCompilationSettings: () => options.compilerOptions,
    getDefaultLibFileName: (compilerOptions) => ts.getDefaultLibFilePath(compilerOptions),
    fileExists: (fileName) => readText(fileName) !== undefined,
    readFile: (fileName) => readText(fileName),
    readDirectory: ts.sys.readDirectory,
    // In-memory files (tests) live in folders that do not exist on disk.
    directoryExists: (directory) =>
      [...overlay.keys()].some((file) => file.startsWith(`${directory}/`)) || ts.sys.directoryExists(directory),
    getDirectories: ts.sys.getDirectories,
  };

  const writeText = (fileName: string, text: string): void => {
    overlay.set(fileName, text);
    edited.set(fileName, text);
    versions.set(fileName, (versions.get(fileName) ?? 0) + 1);
  };

  const moveFile = (from: string, to: string): void => {
    const text = readText(from);
    if (text === undefined) throw new Error(`moveFile: ${from} does not exist`);
    writeText(to, text);
    edited.delete(from);
    overlay.delete(from);
    deleted.add(from);
    versions.set(from, (versions.get(from) ?? 0) + 1);
    roots = roots.map((root) => (root === from ? to : root));
    moves.push([from, to]);
  };

  return {
    service: ts.createLanguageService(host, ts.createDocumentRegistry()),
    readText,
    writeText,
    moveFile,
    changedFiles: () => edited,
    movedFiles: () => moves,
    rootFiles: () => roots,
  };
};

/**
 * The repo project from `tsconfig.json`. `.mjs` files are outside the
 * tsconfig program; `includeMjs` adds `scripts/**` `.mjs` files as roots.
 */
export const loadRepoProject = (repoRoot: string, includeMjs = false): EditableProject => {
  const configPath = path.join(repoRoot, 'tsconfig.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  });
  if (!parsed) throw new Error(`Cannot parse ${configPath}`);
  const mjsFiles = includeMjs
    ? ts.sys.readDirectory(path.join(repoRoot, 'scripts'), ['.mjs'], ['**/node_modules/**'], ['**/*'])
    : [];
  const rootFiles = [...parsed.fileNames, ...mjsFiles].filter((file) => !file.includes('/.next/'));
  return createEditableProject({ rootFiles, compilerOptions: parsed.options, currentDirectory: repoRoot });
};
