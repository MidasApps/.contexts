import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The API base is an origin (scheme://host[:port]): `/v1/...` is appended by
// the client, and the Tauri CSP `connect-src` is derived from the same value.
const ApiOriginSchema = z
  .url({ protocol: /^https?$/, error: "expected an http(s) URL" })
  .transform((value) => value.replace(/\/$/, ""))
  .refine((value) => new URL(value).origin === value, { error: "expected an origin without path" })
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || LOOPBACK_HOSTS.has(url.hostname);
  }, { error: "plain http is allowed for loopback only" });

/**
 * Client-side env (contracts/secrets.md §5.3–5.4): public VITE_* values only,
 * validated once at startup. Nothing here may ever be a secret.
 */
export const DesktopEnvSchema = z.object({
  VITE_API_URL: ApiOriginSchema,
});

export type DesktopEnv = z.infer<typeof DesktopEnvSchema>;

/** Startup failure: the bundled env does not satisfy the schema. */
export class InvalidDesktopEnvError extends Error {
  readonly code = "INVALID_ENV";
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    // Names only, never values (mirrors the server env loaders).
    super(`invalid environment: ${fields.join(", ")}`);
    this.name = "InvalidDesktopEnvError";
    this.fields = fields;
  }
}

/**
 * @param source `import.meta.env` (or Vite's `loadEnv` output in scripts).
 * @throws {InvalidDesktopEnvError} naming each invalid variable.
 */
export const loadDesktopEnv = (source: Record<string, unknown>): DesktopEnv => {
  const result = DesktopEnvSchema.safeParse(source);
  if (result.success) return result.data;
  throw new InvalidDesktopEnvError([...new Set(result.error.issues.map((issue) => issue.path.map(String).join(".")))]);
};
