// `pnpm platform:grant-staff -- --project <id> --email <email> --role <platform-admin|platform-support> --confirm <id>`
// (root): makes an existing Auth user platform staff (SP1 spec §3.4). No console edits: the
// staff doc and a PLATFORM_STAFF_GRANTED platform audit entry are written in one transaction.
// Outside `local` the Admin SDK uses Application Default Credentials (`gcloud auth
// application-default login`); `local` needs the emulators and a demo-* project.
import { existsSync } from "node:fs";
import path from "node:path";
import { createFirebaseAdmin, createLogger, resolveRequestId, UserIdSchema } from "@core/services";
import { createCoreServer } from "@core/services/composition";
import { parseGrantStaffArgs } from "./src/staff/grant-staff-args.ts";

const ENV_FILE = path.resolve(import.meta.dirname, "../.env.local");

const print = (line: string): void => {
  process.stdout.write(`[platform:grant-staff] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const args = parseGrantStaffArgs(process.argv.slice(2).filter((arg) => arg !== "--"), process.env);
  const firebase = createFirebaseAdmin({ env: { APP_ENV: args.appEnv, FIREBASE_PROJECT_ID: args.projectId }, processEnv: process.env });
  const logger = createLogger({ context: { service: "scripts", env: args.appEnv } });
  const server = createCoreServer({ env: { API_KEY_PREFIX: "core" }, firebase, logger });
  // The email only finds the account; it is never printed or audited.
  const account = await firebase.auth.getUserByEmail(args.email);
  const staff = await server.platform.grantPlatformStaff({ uid: UserIdSchema.parse(account.uid), role: args.role, requestId: resolveRequestId(null) });
  print(`project ${args.projectId}: uid ${staff.uid} is ${staff.role} (MFA is still required to use it)`);
};

try {
  await main();
} catch (error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = code === "auth/user-not-found" ? "no Auth account has that email" : error instanceof Error ? error.message : String(error);
  print(`failed: ${message}`);
  process.exitCode = 1;
}
