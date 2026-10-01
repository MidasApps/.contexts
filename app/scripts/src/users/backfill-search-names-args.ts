import { z } from "zod";

/** Where `pnpm users:backfill-search-names` runs and how (decision 0044). */
export type BackfillSearchNamesArgs = {
  readonly projectId: string;
  readonly appEnv: "local" | "dev" | "staging" | "prod";
  readonly dryRun: boolean;
  /** Resume after this user id (the last checkpoint a stopped run printed). */
  readonly startAfter: string | undefined;
  readonly batchSize: number;
};

/** Thrown for missing, unknown or unconfirmed flags; names flags and variables, never values. */
export class BackfillSearchNamesArgsError extends Error {
  readonly code = "INVALID_BACKFILL_SEARCH_NAMES_ARGS";

  constructor(reason: string) {
    super(`refusing to backfill users.searchName: ${reason}`);
    this.name = "BackfillSearchNamesArgsError";
  }
}

const VALUE_FLAGS = ["--project", "--confirm", "--start-after", "--batch-size"] as const;
const DRY_RUN = "--dry-run";

const ProjectIdSchema = z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
const AppEnvSchema = z.enum(["local", "dev", "staging", "prod"]);
const BatchSizeSchema = z.coerce.number().int().min(1).max(400);

const readFlags = (argv: readonly string[]): { values: Map<string, string>; dryRun: boolean } => {
  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? "";
    if (flag === DRY_RUN) {
      dryRun = true;
      continue;
    }
    if (!(VALUE_FLAGS as readonly string[]).includes(flag)) throw new BackfillSearchNamesArgsError(`unknown argument ${flag.startsWith("--") ? flag : "(value)"}`);
    if (values.has(flag)) throw new BackfillSearchNamesArgsError(`${flag} given twice`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new BackfillSearchNamesArgsError(`${flag} needs a value`);
    values.set(flag, value);
    index += 1;
  }
  return { values, dryRun };
};

// Local runs only reach an emulator project; remote runs never target one (processes/environments.md).
const checkEnvironment = (appEnv: BackfillSearchNamesArgs["appEnv"], projectId: string): void => {
  const emulator = projectId.startsWith("demo-");
  if (appEnv === "local" && !emulator) throw new BackfillSearchNamesArgsError("APP_ENV=local only targets a demo-* emulator project");
  if (appEnv !== "local" && emulator) throw new BackfillSearchNamesArgsError(`APP_ENV=${appEnv} cannot target a demo-* emulator project`);
};

/**
 * Parses `--project <id> --confirm <id> [--dry-run] [--start-after <uid>] [--batch-size <1-400>]`;
 * `--confirm` must repeat `--project` (no silent cross-project writes).
 * @throws {BackfillSearchNamesArgsError} naming the offending flag or variable.
 */
export const parseBackfillSearchNamesArgs = (argv: readonly string[], env: Readonly<Record<string, string | undefined>>): BackfillSearchNamesArgs => {
  const { values, dryRun } = readFlags(argv);
  const projectId = values.get("--project");
  if (projectId === undefined) throw new BackfillSearchNamesArgsError("missing --project");
  if (!ProjectIdSchema.safeParse(projectId).success) throw new BackfillSearchNamesArgsError("--project is not a Firebase project id");
  if (values.get("--confirm") !== projectId) throw new BackfillSearchNamesArgsError("--confirm must equal --project");
  const appEnv = AppEnvSchema.safeParse(env["APP_ENV"]);
  if (!appEnv.success) throw new BackfillSearchNamesArgsError("APP_ENV must be local, dev, staging or prod");
  checkEnvironment(appEnv.data, projectId);
  const batchSize = BatchSizeSchema.safeParse(values.get("--batch-size") ?? "200");
  if (!batchSize.success) throw new BackfillSearchNamesArgsError("--batch-size must be an integer from 1 to 400");
  return { projectId, appEnv: appEnv.data, dryRun, startAfter: values.get("--start-after"), batchSize: batchSize.data };
};
