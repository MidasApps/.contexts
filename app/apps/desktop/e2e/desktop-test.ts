import path from "node:path";
import { createE2eTest } from "@core/e2e/test";

/** The desktop run's world file, gitignored like the web one (`e2e/.auth/`). */
export const DESKTOP_AUTH_DIR = path.resolve(import.meta.dirname, ".auth");

/** The shared e2e fixtures (env, emulator, fresh users) with the world the desktop setup wrote. */
export const test = createE2eTest({ authDir: DESKTOP_AUTH_DIR });

export { expect } from "@playwright/test";
