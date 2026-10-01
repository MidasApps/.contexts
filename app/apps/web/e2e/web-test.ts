import path from "node:path";
import { authFile as authFileIn } from "@core/e2e/seed-users";
import { createE2eTest } from "@core/e2e/test";

/** The web run's storage states and world file (gitignored `e2e/.auth/`). */
export const WEB_AUTH_DIR = path.resolve(import.meta.dirname, ".auth");

/** Storage state (or world file) of the web run by name: `owner`, `viewer`, `restricted`, `staff`. */
export const authFile = (name: string): string => authFileIn(name, WEB_AUTH_DIR);

export const test = createE2eTest({ authDir: WEB_AUTH_DIR });

export type { FreshUser } from "@core/e2e/test";
export { expect } from "@playwright/test";
