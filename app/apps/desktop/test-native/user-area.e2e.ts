import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { SEED_USERS } from "@core/e2e/seed-users";

// SP2 gate item 8: the native Tauri app opens the user area. The e2e world makes "Alpha Org" the
// owner's last context. Screenshots go to NATIVE_SCREENSHOT_DIR when set (report evidence).
const SCREENSHOT_DIR = process.env["NATIVE_SCREENSHOT_DIR"];
const KEYCHAIN_ENTRY = "desktop-session.dev.core.desktop";

const screenshot = async (name: string): Promise<void> => {
  if (SCREENSHOT_DIR === undefined) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SCREENSHOT_DIR, `${name}.png`));
};

/** Windows Credential Manager holds the desktop session entry (decision 0017 §1); other OSes: unknown. */
const keychainHasSession = (): boolean | undefined =>
  process.platform === "win32" ? execFileSync("cmdkey", ["/list"], { encoding: "utf8" }).includes(KEYCHAIN_ENTRY) : undefined;

/**
 * Clicks once the element stays put: the shell re-renders when the session's claims arrive, so a
 * found element can go stale before the click lands.
 */
const clickWhenStable = async (selector: string): Promise<void> => {
  await browser.waitUntil(
    async () => {
      try {
        await $(selector).click();
        return true;
      } catch {
        return false;
      }
    },
    { timeoutMsg: `could not click ${selector}` },
  );
};

describe("desktop user area (native Tauri window)", () => {
  // A failed run must not leave this test's session in the real keychain (Windows).
  after(() => {
    if (keychainHasSession() === true) execFileSync("cmdkey", [`/delete:${KEYCHAIN_ENTRY}`]);
  });

  it("signs in as the seeded owner, shows the sidebar and main, and signs out", async () => {
    const owner = SEED_USERS.owner;
    await expect($("aria/Entrar")).toBeDisplayed();
    await screenshot("native-1-sign-in");
    await $("aria/E-mail").setValue(owner.email);
    await $("aria/Senha").setValue(owner.password);
    await clickWhenStable("button=Entrar");

    const switcher = $("aria/Alpha Org, trocar de organização");
    await expect(switcher).toBeDisplayed();
    await expect($("main")).toBeDisplayed();
    await expect($("h1=Alpha Org")).toBeDisplayed();
    await screenshot("native-2-user-area");
    if (keychainHasSession() !== undefined) await browser.waitUntil(() => keychainHasSession() === true, { timeoutMsg: "no keychain entry after sign-in" });

    await clickWhenStable(`aria/${owner.displayName}, menu da conta`);
    await clickWhenStable("aria/Sair");
    await expect($("aria/Senha")).toBeDisplayed();
    await screenshot("native-3-signed-out");
    if (keychainHasSession() !== undefined) await browser.waitUntil(() => keychainHasSession() === false, { timeoutMsg: "keychain entry left after sign-out" });
  });
});
