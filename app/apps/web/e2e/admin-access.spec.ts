import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { V1RequestError } from "@core/e2e/api";
import { signInThroughUi } from "@core/e2e/sign-in";
import { authFile } from "./web-test.ts";
import { expect, openAs, test } from "./sp5-test.ts";

// SP5 Task 16: who is refused by `/admin`. Non-staff get the not-found page on every area and a
// 403 from `/v1/admin/*`. Staff whose session has no second factor are refused the same way: the
// admin layout requires staff + MFA on the session (SP1 spec §3.4) and the API answers MFA_REQUIRED.

const AREAS = ["admin/organizations", "admin/users", "admin/traces", "admin/costs", "admin/workflows", "admin/flags", "admin/logs"];
const APP_ROOT = path.resolve(import.meta.dirname, "../../..");
const run = promisify(execFile);

test.describe("a user who is not platform staff", () => {
  for (const user of ["owner", "viewer"] as const) {
    test(`${user} gets the not-found page on every admin area`, async ({ browser }) => {
      const session = await openAs(browser, authFile(user));
      for (const area of AREAS) {
        await session.page.goto(area);
        await expect(session.page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
        await expect(session.page.getByRole("navigation", { name: "Áreas da administração" })).toHaveCount(0);
      }
      await session.close();
    });
  }

  test("the admin API answers 403 to an organization owner", async ({ ownerApi }) => {
    for (const path of ["/v1/admin/overview", "/v1/admin/organizations", "/v1/admin/users?query=a", "/v1/admin/usage", "/v1/admin/flags"]) {
      const refused = await ownerApi.get(path).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(refused, path).toBeInstanceOf(V1RequestError);
      expect((refused as V1RequestError).status, path).toBe(403);
    }
  });
});

test.describe("platform staff without a second factor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("gets the not-found page on /admin and MFA_REQUIRED from the API", async ({ page, env, createUser }) => {
    test.setTimeout(180_000);
    const user = await createUser({ label: "Staff without MFA" });
    const project = env.E2E_PROJECT_ID;
    await run(process.execPath, [path.join(APP_ROOT, "scripts", "grant-platform-staff.ts"), "--project", project, "--email", user.email, "--role", "platform-admin", "--confirm", project], {
      cwd: APP_ROOT,
      env: { ...process.env, APP_ENV: "local" },
    });
    await signInThroughUi(page, user);
    for (const area of ["admin", "admin/organizations"]) {
      await page.goto(area);
      await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Números da plataforma" })).toHaveCount(0);
      await expect(page.getByRole("table", { name: "Organizações da plataforma" })).toHaveCount(0);
    }
    const refused = await user.api.get("/v1/admin/overview").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(V1RequestError);
    expect((refused as V1RequestError).status).toBe(403);
    expect((refused as V1RequestError).code).toBe("MFA_REQUIRED");
  });
});
