import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { type DesktopEnv, InvalidDesktopEnvError, loadDesktopEnv } from "../src/config/desktop-env.schema.ts";

/**
 * The build env is invalid and the mode has no env file: almost always a clean checkout running
 * `vite build` (mode `production`). The message says what to create; it names variables, never values.
 */
export class MissingDesktopEnvFileError extends InvalidDesktopEnvError {
  constructor(fields: readonly string[], mode: string) {
    super(fields);
    this.name = "MissingDesktopEnvFileError";
    this.message =
      `${this.message}. apps/desktop has no .env.${mode}: copy .env.${mode}.example to .env.${mode} and set the values of the ` +
      `target environment, or pass the VITE_* variables in the shell (apps/desktop/README.md, "Build env")`;
  }
}

const hasModeEnvFile = (mode: string, envDir: string): boolean =>
  [`.env.${mode}`, `.env.${mode}.local`].some((file) => existsSync(path.join(envDir, file)));

/**
 * Resolves and validates the client env for a Vite mode exactly as Vite will
 * bundle it (shell env > `.env.[mode].local` > `.env.[mode]` > `.env`, VITE_* only).
 * Used by vite.config.ts and the Tauri CSP script so a build fails closed.
 * @throws {InvalidDesktopEnvError} naming each invalid variable, never its value;
 *   {@link MissingDesktopEnvFileError} when the mode also has no env file.
 */
export const loadDesktopBuildEnv = (args: { mode: string; envDir: string }): DesktopEnv => {
  try {
    return loadDesktopEnv(loadEnv(args.mode, args.envDir, "VITE_"));
  } catch (error: unknown) {
    if (error instanceof InvalidDesktopEnvError && !hasModeEnvFile(args.mode, args.envDir)) {
      throw new MissingDesktopEnvFileError(error.fields, args.mode);
    }
    throw error;
  }
};
