import { loadEnv } from "vite";
import { type DesktopEnv, loadDesktopEnv } from "../src/config/desktop-env.schema.ts";

/**
 * Resolves and validates the client env for a Vite mode exactly as Vite will
 * bundle it (shell env > `.env.[mode].local` > `.env.[mode]` > `.env`, VITE_* only).
 * Used by vite.config.ts and the Tauri CSP script so a build fails closed.
 * @throws {InvalidDesktopEnvError} naming each invalid variable, never its value.
 */
export const loadDesktopBuildEnv = (args: { mode: string; envDir: string }): DesktopEnv =>
  loadDesktopEnv(loadEnv(args.mode, args.envDir, "VITE_"));
