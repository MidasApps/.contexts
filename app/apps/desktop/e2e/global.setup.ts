import { test as setup } from "@playwright/test";
import { seedWorld, writeWorld } from "@core/e2e/seed-users";
import { readE2eEnv } from "@core/e2e/e2e-env";
import { DESKTOP_AUTH_DIR } from "./desktop-test.ts";

// Same idempotent world as the web run (it may already exist in these emulators). No storage
// states: in browser mode the desktop keeps its session in memory (decision 0017), so every
// journey signs in through the UI and navigates inside the app.
setup("seed the e2e world", async () => {
  setup.setTimeout(120_000);
  writeWorld(await seedWorld(readE2eEnv()), DESKTOP_AUTH_DIR);
});
