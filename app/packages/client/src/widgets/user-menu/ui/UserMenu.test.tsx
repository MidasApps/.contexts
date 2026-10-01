import { configure, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { buildApprovalRequest } from "#/entities/approval-request/approval-request.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { ORGANIZATION_NODE } from "#/shared/testing/settings-fixtures.ts";
import { UserMenu } from "./UserMenu.tsx";

// Opening the menu inside the whole app composition takes several seconds on a loaded machine.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30_000 });

describe("UserMenu", () => {
  it("shows who is signed in, the profile sections, theme and language", async () => {
    const { user } = renderWidget(<UserMenu />, { path: `/o/${IDS.organization}` });
    await user.click(await screen.findByRole("button", { name: "Ana Souza, menu da conta" }));
    expect(await screen.findByRole("menuitem", { name: "Conta" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Sessões" }).getAttribute("href")).toBe("/profile/sessions");
    expect(screen.getByRole("menuitem", { name: "Idioma e região" }).getAttribute("href")).toBe("/profile/preferences");
    expect(screen.getByRole("menuitem", { name: "Tema" })).toBeDefined();
    await expectNoAxeViolations(document.body);
  });

  it("signs out through the session bridge and lands on sign-in", async () => {
    const { user, router, bridge } = renderWidget(<UserMenu />, { path: `/o/${IDS.organization}` });
    await user.click(await screen.findByRole("button", { name: "Ana Souza, menu da conta" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sair" }));
    await waitFor(() => expect(router.current()).toBe("/sign-in"));
    expect(bridge.ended).toBe(1);
  });

  it("shows how many approvals wait for the viewer's decision and links to the inbox", async () => {
    const here = { tenantId: IDS.organization, node: ORGANIZATION_NODE };
    const { user, api } = renderWidget(<UserMenu />, {
      path: `/o/${IDS.organization}`,
      permissions: ["core.organization.read", "core.approval.read"],
      routes: {
        "GET /v1/organizations/:organizationId/approval-requests": page([
          buildApprovalRequest({ ...here, id: "ApWaiting00000000000" }),
          buildApprovalRequest({ ...here, id: "ApMine00000000000000", requestedBy: { type: "user", id: IDS.user } }),
        ]),
      },
    });
    await user.click(await screen.findByRole("button", { name: "Ana Souza, menu da conta, 1 aprovação aguardando sua decisão" }, { timeout: 8000 }));
    const entry = await screen.findByRole("menuitem", { name: "Aprovações, 1 aguardando sua decisão" });
    expect(entry.getAttribute("href")).toBe(`/o/${IDS.organization}/settings/approvals`);
    expect(api.calls.find((call) => call.path.endsWith("/approval-requests"))?.query).toContain("status=pending");
    await expectNoAxeViolations(document.body);
  });

  it("has no approvals entry and reads no requests without core.approval.read", async () => {
    const { user, api } = renderWidget(<UserMenu />, { path: `/o/${IDS.organization}` });
    await user.click(await screen.findByRole("button", { name: "Ana Souza, menu da conta" }));
    await screen.findByRole("menuitem", { name: "Conta" });
    expect(screen.queryByRole("menuitem", { name: /Aprovações/u })).toBeNull();
    expect(api.callLines().some((line) => line.includes("approval-requests"))).toBe(false);
  });
});
