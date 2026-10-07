import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/** Composition file at the workspace root that lists the modules with Postgres migrations (decision 0077). */
export const MODULE_MIGRATIONS_FILE = "migrations.modules.ts";

/**
 * Schema names a module may not map to: the ones the Postgres contract reserves, the ones the core
 * owns, and the ones whose `<schema>_runtime` role the core already uses (web, knowledge, prompts).
 */
const RESERVED_SCHEMAS: ReadonlySet<string> = new Set([
  "public",
  "information_schema",
  "migrations",
  "audit",
  "archive",
  "mastra",
  "ai",
  "semantic",
  "usage",
  "agents",
  "web",
  "knowledge",
  "prompts",
]);

// `module_<schema>` and `<schema>_runtime` must fit Postgres' 63-byte identifiers.
const MAX_SCHEMA_LENGTH = 48;

const EntrySchema = z.strictObject({
  moduleId: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  folder: z.string().min(1),
});

/** One module's migrations as `pnpm db:migrate` applies them. */
export type ModuleMigrations = {
  readonly moduleId: string;
  /** The module's schema: its id with `-` as `_`. */
  readonly schema: string;
  /** NOLOGIN role the module's queries run as: `<schema>_runtime`. */
  readonly runtimeRole: string;
  /** The module's own journal table in schema `migrations`: `module_<schema>`. */
  readonly journalTable: string;
  /** Absolute path of the folder with `meta/_journal.json` and the `.sql` files. */
  readonly folder: string;
};

/** Thrown when `migrations.modules.ts` is malformed; the message names every problem. */
export class ModuleMigrationsError extends Error {
  readonly code = "INVALID_MODULE_MIGRATIONS";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`invalid ${MODULE_MIGRATIONS_FILE}: ${problems.join("; ")}`);
    this.name = "ModuleMigrationsError";
    this.problems = problems;
  }
}

/** Schema, runtime role and journal table of a module id (decision 0077). */
export const moduleSqlNames = (moduleId: string): Pick<ModuleMigrations, "schema" | "runtimeRole" | "journalTable"> => {
  const schema = moduleId.replaceAll("-", "_");
  return { schema, runtimeRole: `${schema}_runtime`, journalTable: `module_${schema}` };
};

const isInside = (root: string, folder: string): boolean => {
  const relative = path.relative(root, folder);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const hasJournalFile = (folder: string): boolean => existsSync(path.join(folder, "meta", "_journal.json"));

const problemsOfEntry = (args: {
  root: string;
  entry: z.infer<typeof EntrySchema>;
  module: ModuleMigrations;
  seen: ReadonlySet<string>;
  hasJournal: (folder: string) => boolean;
}): string[] => {
  const { entry, module } = args;
  const reserved = RESERVED_SCHEMAS.has(module.schema) || module.schema.startsWith("pg_");
  const inside = isInside(args.root, module.folder);
  return [
    ...(args.seen.has(entry.moduleId) ? [`${entry.moduleId} is listed twice`] : []),
    ...(reserved ? [`${entry.moduleId} maps to the reserved schema ${module.schema}`] : []),
    ...(module.schema.length > MAX_SCHEMA_LENGTH
      ? [`${entry.moduleId} is longer than ${String(MAX_SCHEMA_LENGTH)} characters`]
      : []),
    ...(inside ? [] : [`${entry.moduleId}: the folder must be inside the workspace`]),
    ...(inside && !args.hasJournal(module.folder)
      ? [`${entry.moduleId}: ${entry.folder} has no meta/_journal.json`]
      : []),
  ];
};

/**
 * Validates the exported list against the workspace root.
 * @throws {ModuleMigrationsError} naming every problem at once.
 */
export const parseModuleMigrations = (
  root: string,
  value: unknown,
  hasJournal: (folder: string) => boolean = hasJournalFile,
): ModuleMigrations[] => {
  if (!Array.isArray(value)) throw new ModuleMigrationsError(["must export MODULE_MIGRATIONS (an array)"]);
  const problems: string[] = [];
  const modules: ModuleMigrations[] = [];
  const seen = new Set<string>();
  value.forEach((raw: unknown, position) => {
    const parsed = EntrySchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(`entry ${String(position)} must be { moduleId: kebab-case, folder }`);
      return;
    }
    const entry = parsed.data;
    const module = {
      moduleId: entry.moduleId,
      ...moduleSqlNames(entry.moduleId),
      folder: path.resolve(root, entry.folder),
    };
    problems.push(...problemsOfEntry({ root, entry, module, seen, hasJournal }));
    seen.add(entry.moduleId);
    modules.push(module);
  });
  if (problems.length > 0) throw new ModuleMigrationsError(problems);
  return modules;
};

const exists = async (file: string): Promise<boolean> => {
  try {
    await access(file);
    return true;
  } catch {
    // Absent file = no module has migrations; `access` has no other expected failure here.
    return false;
  }
};

/**
 * The modules listed in `<root>/migrations.modules.ts`, or none when the file is absent.
 * @throws {ModuleMigrationsError} the list is malformed.
 */
export const loadModuleMigrations = async (root: string): Promise<ModuleMigrations[]> => {
  const file = path.join(root, MODULE_MIGRATIONS_FILE);
  if (!(await exists(file))) return [];
  const loaded = (await import(pathToFileURL(file).href)) as { MODULE_MIGRATIONS?: unknown };
  return parseModuleMigrations(root, loaded.MODULE_MIGRATIONS);
};
