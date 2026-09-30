import { type App, type AppOptions, getApps, initializeApp } from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import type { ServicesEnv } from "../env/services-env.schema.ts";

/** The modular Admin SDK entry points the factory needs; tests inject fakes. */
export type FirebaseAdminSdk = {
  getApps: () => App[];
  initializeApp: (options: AppOptions, name: string) => App;
  getAuth: (app: App) => Auth;
  getFirestore: (app: App) => Firestore;
};

export type FirebaseAdmin = { app: App; auth: Auth; firestore: Firestore };

const DEFAULT_SDK: FirebaseAdminSdk = { getApps, initializeApp, getAuth, getFirestore };

// Named app: another library initializing the default app cannot collide with ours.
const APP_NAME = "core-services";
const EMULATOR_HOST_KEY = /_EMULATOR_HOST$/;

/**
 * Bug/misconfiguration: an emulator host is set outside `local`. firebase-admin
 * reads these variables from `process.env` itself, and in emulator mode the Auth
 * SDK accepts unsigned tokens, so a stray host would allow forged tokens.
 */
export class EmulatorOutsideLocalError extends Error {
  readonly code = "EMULATOR_OUTSIDE_LOCAL";
  readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(`emulator hosts are local only; unset: ${keys.join(", ")}`);
    this.name = "EmulatorOutsideLocalError";
    this.keys = keys;
  }
}

const findEmulatorHosts = (processEnv: Record<string, string | undefined>): string[] =>
  Object.entries(processEnv)
    .filter(([key, value]) => EMULATOR_HOST_KEY.test(key) && value !== undefined && value !== "")
    .map(([key]) => key)
    .sort();

/**
 * Creates (or reuses, across dev-server reloads) the Admin SDK clients.
 * Defense in depth next to `ServicesEnvSchema` (follow-up #12c): the schema only
 * sees the keys it declares, while firebase-admin reads any `*_EMULATOR_HOST`.
 * @param processEnv the raw `process.env`, inspected for emulator hosts only.
 * @throws {EmulatorOutsideLocalError} when an emulator host is set and `APP_ENV !== "local"`.
 */
export const createFirebaseAdmin = (args: {
  env: Pick<ServicesEnv, "APP_ENV" | "FIREBASE_PROJECT_ID">;
  processEnv: Record<string, string | undefined>;
  sdk?: FirebaseAdminSdk;
}): FirebaseAdmin => {
  const { env, processEnv, sdk = DEFAULT_SDK } = args;
  if (env.APP_ENV !== "local") {
    const hosts = findEmulatorHosts(processEnv);
    if (hosts.length > 0) throw new EmulatorOutsideLocalError(hosts);
  }
  const app =
    sdk.getApps().find((candidate) => candidate.name === APP_NAME) ??
    sdk.initializeApp({ projectId: env.FIREBASE_PROJECT_ID }, APP_NAME);
  return { app, auth: sdk.getAuth(app), firestore: sdk.getFirestore(app) };
};
