// `pnpm users:backfill-search-names -- --project <id> --confirm <id> [--dry-run] [--start-after <uid>] [--batch-size <n>]`
// (root): writes the storage-only `users.searchName` the staff user search reads (decision 0044,
// migration phase "migrate"). Idempotent and resumable: a second run updates nothing, and a stopped
// run continues with `--start-after <last checkpoint>`. Only ids and counts are printed, never a
// name or an email. Outside `local` the Admin SDK uses Application Default Credentials.
import { existsSync } from "node:fs";
import path from "node:path";
import { backfillUserSearchNames, createFirebaseAdmin } from "@core/services";
import { parseBackfillSearchNamesArgs } from "./src/users/backfill-search-names-args.ts";

const ENV_FILE = path.resolve(import.meta.dirname, "../.env.local");

const print = (line: string): void => {
  process.stdout.write(`[users:backfill-search-names] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const args = parseBackfillSearchNamesArgs(
    process.argv.slice(2).filter((arg) => arg !== "--"),
    process.env,
  );
  const firebase = createFirebaseAdmin({ env: { APP_ENV: args.appEnv, FIREBASE_PROJECT_ID: args.projectId }, processEnv: process.env });
  const verb = args.dryRun ? "would update" : "updated";
  print(`project ${args.projectId}${args.dryRun ? " (dry run: nothing is written)" : ""}`);
  const result = await backfillUserSearchNames({
    firestore: firebase.firestore,
    batchSize: args.batchSize,
    dryRun: args.dryRun,
    ...(args.startAfter === undefined ? {} : { startAfter: args.startAfter }),
    onBatch: (progress) => print(`checkpoint ${progress.lastId ?? "-"}: scanned ${progress.scanned}, ${verb} ${progress.updated}`),
  });
  print(`done: scanned ${result.scanned}, ${verb} ${result.updated}`);
};

try {
  await main();
} catch (error: unknown) {
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
