// Emulator test harness for `/v1` route tests: the real core server over the Firestore and
// Auth emulators, with a fake token verifier (`Bearer token-<uid>` → that user).
import type { Firestore } from "firebase-admin/firestore";
import { createFakeTokenVerifier } from "../../identity/adapters/driven/fake-token-verifier.ts";
import { createCoreServer, type CoreServer, type CoreServerModule } from "../../composition.ts";
import { createFirebaseAdmin, type FirebaseAdmin } from "../firebase/firebase-admin.ts";
import { CORE_COLLECTIONS } from "../firestore/collections.ts";
import { createLogger, type LogRecord } from "../observability/logger.ts";

/** Firebase Admin bound to the emulators exported by `firebase emulators:exec`. */
export const emulatorFirebase = (): FirebaseAdmin =>
  createFirebaseAdmin({ env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" }, processEnv: process.env });

/** Deletes every core collection the route tests touch (one emulator per run, files run serially). */
export const clearCoreCollections = async (firestore: Firestore): Promise<void> => {
  const names = [...Object.values(CORE_COLLECTIONS), "audit-logs", "platform-audit-logs", "rate-limit-buckets", "idempotency-records"];
  await Promise.all(names.map((name) => firestore.recursiveDelete(firestore.collection(name))));
};

/** Seeds an active `users/{uid}` doc with the fields access reads. */
export const seedActiveUser = async (firestore: Firestore, uid: string): Promise<void> => {
  await firestore.collection(CORE_COLLECTIONS.users).doc(uid).set({ status: "active", accessVersion: 0, lastContext: {} });
};

type CallArgs = { readonly method: string; readonly path: string; readonly as?: string; readonly body?: unknown };

/**
 * Builds the core server with a fake verifier that accepts `token-<uid>` for every uid in
 * `uids`, and `call(endpointId, { method, path, as, body })` to drive a route.
 */
export const buildEmulatorServer = (args: {
  firebase: FirebaseAdmin;
  uids: readonly string[];
  modules?: readonly CoreServerModule[];
  build?: (base: Parameters<typeof createCoreServer>[0]) => CoreServer;
}) => {
  const logs: LogRecord[] = [];
  const tokens = Object.fromEntries(args.uids.map((uid) => [`token-${uid}`, { uid, claims: {}, signInProvider: "password", secondFactor: null }]));
  const base = {
    env: { API_KEY_PREFIX: "core" },
    firebase: args.firebase,
    logger: createLogger({ context: { service: "test", env: "local" }, sink: (record) => logs.push(record) }),
    ...(args.modules === undefined ? {} : { modules: args.modules }),
    adapters: { tokenVerifier: createFakeTokenVerifier({ tokens }) },
  };
  const server = (args.build ?? createCoreServer)(base);
  const call = async (endpointId: string, request: CallArgs): Promise<Response> => {
    const handler = server.routes[endpointId];
    if (handler === undefined) throw new Error(`no handler for ${endpointId}`);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (request.as !== undefined) headers["authorization"] = `Bearer token-${request.as}`;
    const init: RequestInit = { method: request.method, headers, ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }) };
    return handler(new Request(`http://localhost${request.path}`, init));
  };
  return { server, call, logs };
};
