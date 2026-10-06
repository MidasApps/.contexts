import { z } from "zod";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

const LoopbackOriginSchema = z
  .url({ protocol: /^http$/ })
  .refine((value) => LOOPBACK_HOSTS.has(new URL(value).hostname), {
    error: "the e2e stack runs on loopback only",
  });

/**
 * What the Playwright processes read from the env that root `pnpm test:e2e` (scripts/e2e.ts)
 * exports. Parsed once per config; a missing variable means Playwright was started outside the
 * e2e stack, which would sign in against whatever `.env.local` points at.
 */
const E2eEnvSchema = z.object({
  E2E_WEB_PORT: z.coerce.number().int(),
  E2E_DESKTOP_PORT: z.coerce.number().int(),
  E2E_WEB_ORIGIN: LoopbackOriginSchema,
  E2E_DESKTOP_ORIGIN: LoopbackOriginSchema,
  E2E_MASTRA_PORT: z.coerce.number().int(),
  E2E_MASTRA_ORIGIN: LoopbackOriginSchema,
  E2E_AUTH_EMULATOR_ORIGIN: LoopbackOriginSchema,
  E2E_PROJECT_ID: z.string().startsWith("demo-"),
  FIRESTORE_EMULATOR_HOST: z.string().min(1),
  // Opt-in reuse of servers already listening on the e2e ports (see e2e/support/web-server.ts).
  E2E_REUSE_SERVERS: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  // Screenshot at the end of every test (evidence for reports); failures always get one.
  E2E_SCREENSHOTS: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
});

export type E2eEnv = z.infer<typeof E2eEnvSchema>;

/** Thrown when Playwright runs outside the e2e stack; names the variables, never values. */
export class MissingE2eEnvError extends Error {
  readonly code = "MISSING_E2E_ENV";
  constructor(variables: readonly string[]) {
    super(
      `e2e env missing or invalid (${variables.join(", ")}): run through \`pnpm test:e2e\` ` +
        "(or `pnpm test:e2e -- <command>`) from app/, which starts the e2e emulators and exports it",
    );
    this.name = "MissingE2eEnvError";
  }
}

/**
 * Reads the e2e env.
 * @throws {MissingE2eEnvError} when a variable is missing or not a loopback/demo target.
 */
export const readE2eEnv = (source: Readonly<Record<string, string | undefined>> = process.env): E2eEnv => {
  const parsed = E2eEnvSchema.safeParse(source);
  if (!parsed.success)
    throw new MissingE2eEnvError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  return parsed.data;
};
