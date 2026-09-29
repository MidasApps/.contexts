/** Shared types of the rename codemod (`rename-identifiers.ts`, `rename-file.ts`). */

export type RenameMapEntry = Readonly<{
  file: string;
  line: number;
  from: string;
  to: string;
  kind: 'local' | 'prop' | 'file';
  persisted: boolean;
  needsAudit?: boolean;
  note?: string;
}>;

export type RenamePolicy = Readonly<{
  repoRoot: string;
  protectedNames: ReadonlySet<string>;
  excludedFolders: readonly string[];
}>;

export type RenameResult = Readonly<{
  locations: number;
  stringHits: readonly string[];
  /** An earlier entry already renamed this symbol (same property declared in several literals). */
  alreadyApplied?: boolean;
}>;

export class RenameRefusedError extends Error {
  constructor(entry: RenameMapEntry, reason: string) {
    super(`${entry.kind} ${entry.from} -> ${entry.to} (${entry.file}:${entry.line}): ${reason}`);
    this.name = 'RenameRefusedError';
  }
}
