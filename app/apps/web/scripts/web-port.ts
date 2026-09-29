/** `next dev` port when WEB_PORT is unset (processes/environments.md §9: localhost:3000). */
export const DEFAULT_WEB_PORT = 3000;

const PORT_PATTERN = /^\d{1,5}$/;

/**
 * Port for the local web dev server. WEB_PORT, not PORT: `pnpm dev` runs web and
 * Mastra under one turbo process with one env, and Mastra reads PORT.
 *
 * @throws {Error} when WEB_PORT is set but is not an integer in 1–65535; the
 *   message names the variable.
 */
export const resolveWebPort = (env: Readonly<Record<string, string | undefined>>): number => {
  const raw = env["WEB_PORT"];
  if (raw === undefined || raw === "") return DEFAULT_WEB_PORT;
  const port = PORT_PATTERN.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("invalid environment: WEB_PORT must be an integer between 1 and 65535");
  }
  return port;
};
