import { z } from "zod";

/**
 * The e2e stack's own Firebase project: a second `demo-*` project keeps its data, its emulator
 * hub locator and its ports apart from `pnpm dev` (demo-core), so both can run at the same time.
 */
export const E2E_PROJECT_ID = "demo-core-e2e";
export const E2E_FIREBASE_CONFIG = "firebase.e2e.json";
// Chat (SP4) needs uploads: Storage and the Functions trigger that validates them.
export const E2E_EMULATORS = ["auth", "firestore", "storage", "functions"] as const;
/** The e2e run's own database in the compose Postgres, so journeys never write into `pnpm dev`'s. */
export const E2E_DATABASE_NAME = "app_e2e";
/**
 * Loading `apps/functions/lib` takes longer than the emulator's 10 s default on a busy machine
 * ("Cannot determine backend specification"); uploads would then never leave `pending`.
 */
export const FUNCTIONS_DISCOVERY_TIMEOUT_SECONDS = "180";

const DEFAULT_WEB_PORT = 3100;
const DEFAULT_DESKTOP_PORT = 1420;
// Apart from `mastra dev` (4111), so both stacks can run at the same time.
const DEFAULT_MASTRA_PORT = 4191;
// The compose Postgres of .env.example; another local stack on the machine moves it (E2E_POSTGRES_PORT).
const DEFAULT_POSTGRES_PORT = 5432;
// Never started by the e2e run (nothing in the journeys publishes; its java process also outlives
// `emulators:exec` on Windows): a service that would use it fails loudly instead of reaching the
// dev emulator of `pnpm dev` (processes/environments.md: no cross-environment traffic).
const UNUSED_PUBSUB_EMULATOR = "127.0.0.1:8691";
/** Origins of the native Tauri webview, allowed by the e2e web so the native smoke can call `/v1`. */
const TAURI_WEBVIEW_ORIGINS = ["http://tauri.localhost", "tauri://localhost"] as const;
// Port 3000 belongs to another project on developer machines (execution constraints).
const FORBIDDEN_PORTS: ReadonlySet<number> = new Set([3000]);

const PortSchema = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65_535)
  .refine((port) => !FORBIDDEN_PORTS.has(port), { error: "port 3000 is reserved" });

const EmulatorEntrySchema = z.object({ host: z.string().min(1), port: z.number().int() });

/** The emulator hosts of `firebase.e2e.json` (the single source of the e2e emulator ports). */
export const FirebaseE2eConfigSchema = z.object({
  emulators: z.object({
    auth: EmulatorEntrySchema,
    firestore: EmulatorEntrySchema,
    storage: EmulatorEntrySchema,
    functions: EmulatorEntrySchema,
  }),
});

const OverridesSchema = z.object({
  E2E_WEB_PORT: PortSchema.default(DEFAULT_WEB_PORT),
  E2E_DESKTOP_PORT: PortSchema.default(DEFAULT_DESKTOP_PORT),
  E2E_MASTRA_PORT: PortSchema.default(DEFAULT_MASTRA_PORT),
  E2E_POSTGRES_PORT: PortSchema.default(DEFAULT_POSTGRES_PORT),
});

/** Thrown when a port override is invalid; names the variable, never other env values. */
export class InvalidE2eEnvError extends Error {
  readonly code = "INVALID_E2E_ENV";
  readonly variables: readonly string[];
  constructor(variables: readonly string[]) {
    super(`invalid e2e environment: ${variables.join(", ")}`);
    this.name = "InvalidE2eEnvError";
    this.variables = variables;
  }
}

const hostPort = (entry: z.infer<typeof EmulatorEntrySchema>): string => `${entry.host}:${String(entry.port)}`;

/**
 * Every variable the e2e run exports to the web build/start, the desktop build/preview and the
 * Playwright processes. Values the shell already set for these names are replaced on purpose:
 * the e2e stack must never inherit the developer's `.env.local` targets.
 * @throws {InvalidE2eEnvError} for an invalid `E2E_WEB_PORT`, `E2E_DESKTOP_PORT`, `E2E_MASTRA_PORT` or `E2E_POSTGRES_PORT`.
 */
export const buildE2eEnv = (args: {
  firebaseConfig: unknown;
  overrides: Readonly<Record<string, string | undefined>>;
}): Record<string, string> => {
  const config = FirebaseE2eConfigSchema.parse(args.firebaseConfig);
  const parsed = OverridesSchema.safeParse(args.overrides);
  if (!parsed.success)
    throw new InvalidE2eEnvError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  const {
    E2E_WEB_PORT: webPort,
    E2E_DESKTOP_PORT: desktopPort,
    E2E_MASTRA_PORT: mastraPort,
    E2E_POSTGRES_PORT: postgresPort,
  } = parsed.data;
  const mastraOrigin = `http://localhost:${String(mastraPort)}`;
  const webOrigin = `http://localhost:${String(webPort)}`;
  const desktopOrigin = `http://localhost:${String(desktopPort)}`;
  const authHost = hostPort(config.emulators.auth);
  const authOrigin = `http://${authHost}`;
  return {
    E2E_WEB_PORT: String(webPort),
    E2E_DESKTOP_PORT: String(desktopPort),
    E2E_MASTRA_PORT: String(mastraPort),
    E2E_MASTRA_ORIGIN: mastraOrigin,
    E2E_WEB_ORIGIN: webOrigin,
    E2E_DESKTOP_ORIGIN: desktopOrigin,
    E2E_PROJECT_ID,
    E2E_AUTH_EMULATOR_ORIGIN: authOrigin,
    // Server (services + web env).
    APP_ENV: "local",
    AI_MODE: "fake",
    // The compose Postgres of .env.example (local-only credentials), in the e2e run's own
    // database (scripts/src/e2e/e2e-database.ts creates and migrates it).
    DATABASE_URL: `postgresql://app:app@127.0.0.1:${String(postgresPort)}/${E2E_DATABASE_NAME}`,
    // The agent runtime of the chat journeys (apps/mastra with fake models), started by Playwright.
    MASTRA_URL: mastraOrigin,
    MASTRA_HOST: "localhost",
    MASTRA_CORS_ORIGINS: webOrigin,
    MASTRA_TELEMETRY_DISABLED: "1",
    FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
    GCLOUD_PROJECT: E2E_PROJECT_ID,
    FIREBASE_AUTH_EMULATOR_HOST: authHost,
    FIRESTORE_EMULATOR_HOST: hostPort(config.emulators.firestore),
    FIREBASE_STORAGE_EMULATOR_HOST: hostPort(config.emulators.storage),
    PUBSUB_EMULATOR_HOST: UNUSED_PUBSUB_EMULATOR,
    FUNCTIONS_DISCOVERY_TIMEOUT: FUNCTIONS_DISCOVERY_TIMEOUT_SECONDS,
    FILES_BUCKET: `${E2E_PROJECT_ID}.appspot.com`,
    MFA_FACTORS: "phone",
    ORGANIZATION_SELF_SERVE: "true",
    WEB_PORT: String(webPort),
    NEXT_PUBLIC_APP_URL: webOrigin,
    // The desktop preview (desktop-web) and the native Tauri webview (`pnpm -F @core/desktop
    // test:native`): `http://tauri.localhost` on Windows, `tauri://localhost` on macOS/Linux.
    CORS_ALLOWED_ORIGINS: [desktopOrigin, ...TAURI_WEBVIEW_ORIGINS].join(","),
    // Web bundle (inlined at build time).
    NEXT_PUBLIC_APP_ENV: "local",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${E2E_PROJECT_ID}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${E2E_PROJECT_ID}.appspot.com`,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: authOrigin,
    NEXT_PUBLIC_MFA_FACTORS: "phone",
    // Desktop bundle (inlined at build time).
    VITE_API_URL: webOrigin,
    VITE_APP_ENV: "local",
    VITE_FIREBASE_API_KEY: "demo-api-key",
    VITE_FIREBASE_AUTH_DOMAIN: `${E2E_PROJECT_ID}.firebaseapp.com`,
    VITE_FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
    VITE_AUTH_EMULATOR_URL: authOrigin,
    VITE_MFA_FACTORS: "phone",
  };
};

/**
 * Default command inside the emulators (`scripts/e2e-playwright.ts`): the builds, then the web and
 * desktop Playwright runs one at a time (they share the web port), started directly: through
 * `turbo run test:e2e` turbo never exited on Windows after a run (follow-up 87).
 */
export const DEFAULT_E2E_COMMAND = "node scripts/e2e-playwright.ts";

/** `firebase emulators:exec` arguments for the e2e stack. */
export const buildEmulatorExecArgs = (command: string): string[] => [
  "--config",
  E2E_FIREBASE_CONFIG,
  "emulators:exec",
  "--project",
  E2E_PROJECT_ID,
  "--only",
  E2E_EMULATORS.join(","),
  command,
];

// Characters the shell of `firebase emulators:exec` (sh, or cmd on Windows) would split or interpret.
const NEEDS_QUOTES = /[\s|&<>^()"]/;

/**
 * Joins `pnpm test:e2e -- <args>` into the one command string `emulators:exec` runs through a
 * shell, double-quoting each argument that holds spaces or shell operators (e.g. `-g "a|b"`).
 */
export const joinCommandArgs = (args: readonly string[]): string =>
  args.map((arg) => (NEEDS_QUOTES.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg)).join(" ");
