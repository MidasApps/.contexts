import { readE2eEnv } from "@core/e2e/e2e-env";
import { createEmulatorAuth } from "@core/e2e/emulator";
import { readWorld, SEED_USERS, seedWorld, writeWorld } from "@core/e2e/seed-users";
import { completeSmsChallenge, signInThroughUi, submitSignIn } from "@core/e2e/sign-in";
import { warmAgentRuntime } from "@core/e2e/warm-agents";
import { expect, test as setup } from "@playwright/test";
import { authFile, WEB_AUTH_DIR } from "./web-test.ts";

// Seeds the e2e world once, then signs each seeded user in through the UI and keeps the storage
// state. By design it only holds the `__session` cookie (decision 0007): the Firebase client state
// lives in IndexedDB, which storage states skip, so every spec exercises the session exchange.
const env = readE2eEnv();
// The sign-ins need the seeded accounts: run in file order.
setup.describe.configure({ mode: "serial" });

setup("seed the e2e world", async () => {
  setup.setTimeout(120_000);
  writeWorld(await seedWorld(env), WEB_AUTH_DIR);
});

for (const key of ["owner", "viewer", "restricted"] as const) {
  setup(`sign in ${key}`, async ({ page }) => {
    await signInThroughUi(page, SEED_USERS[key]);
    await page.context().storageState({ path: authFile(key) });
  });
}

setup("sign in staff with the SMS second factor", async ({ page }) => {
  await submitSignIn(page, SEED_USERS.staff);
  await completeSmsChallenge(page, createEmulatorAuth(env));
  await expect(page.getByRole("button", { name: `${SEED_USERS.staff.displayName}, menu da conta` })).toBeVisible();
  await page.context().storageState({ path: authFile("staff") });
});

setup("warm the agent runtime", async () => {
  setup.setTimeout(120_000);
  await warmAgentRuntime(env, readWorld(WEB_AUTH_DIR));
});
