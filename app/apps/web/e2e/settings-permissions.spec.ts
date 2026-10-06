import { V1RequestError } from "@core/e2e/api";
import { signInThroughUi } from "@core/e2e/sign-in";
import { addMember, expect, openAs, settingsPath, test } from "./sp5-test.ts";

// SP5 Task 16: a plain member of the organization opens the admin-only agent sections of
// `/settings`. Each one shows the no-access state, the navigation does not offer them, and the
// matching `/v1` endpoint refuses the member with 403.

const ADMIN_ONLY: { section: string; label: string; endpoint: (organizationId: string) => string }[] = [
  { section: "agents", label: "Agentes", endpoint: (id) => `/v1/agents?organizationId=${id}` },
  { section: "connectors", label: "Conectores", endpoint: (id) => `/v1/organizations/${id}/connectors` },
  { section: "usage", label: "Uso e orçamento", endpoint: (id) => `/v1/usage?organizationId=${id}` },
  { section: "traces", label: "Rastros", endpoint: (id) => `/v1/traces?organizationId=${id}` },
  { section: "evals", label: "Avaliações", endpoint: (id) => `/v1/evals/experiments?organizationId=${id}` },
  { section: "flags", label: "Recursos", endpoint: (id) => `/v1/flags?organizationId=${id}` },
  { section: "audit-log", label: "Auditoria", endpoint: (id) => `/v1/organizations/${id}/audit-logs` },
];

test.describe("a member without the admin permissions", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees the no-access state on admin-only sections and the API refuses", async ({
    browser,
    sp5Org,
    ownerApi,
    createUser,
  }) => {
    test.setTimeout(240_000);
    const member = await createUser({ label: "Member" });
    await addMember({
      owner: ownerApi,
      user: member,
      organizationId: sp5Org.id,
      roles: [{ kind: "system", key: "member" }],
    });

    for (const { endpoint } of ADMIN_ONLY) {
      const refused = await member.api.get(endpoint(sp5Org.id)).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(refused, endpoint(sp5Org.id)).toBeInstanceOf(V1RequestError);
      expect((refused as V1RequestError).status, endpoint(sp5Org.id)).toBe(403);
    }

    const session = await openAs(browser, { cookies: [], origins: [] });
    await signInThroughUi(session.page, member);
    for (const { section, label } of ADMIN_ONLY) {
      await session.page.goto(settingsPath(sp5Org.id, section));
      await expect(
        session.page.getByRole("heading", { level: 2, name: "Você não tem acesso a esta página" }),
      ).toBeVisible();
      const nav = session.page.getByRole("navigation", { name: "Seções das configurações" });
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }
    // A member reads the approvals inbox (core.approval.read) but decides nothing.
    await session.page.goto(settingsPath(sp5Org.id, "approvals"));
    await expect(session.page.getByRole("heading", { level: 1, name: "Aprovações" })).toBeVisible();
    await session.close();
  });
});
