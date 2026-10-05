import { AUDIT_ACTIONS, type Permission } from "@core/contracts";
import { CORE_MESSAGES } from "@core/i18n";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { type FakeRequest, type FakeRoutes, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildMember } from "#/shared/testing/settings-fixtures.ts";
import { SettingsAuditLogView } from "./SettingsAuditLogView.tsx";

const BRUNO = buildMember();
const ENTRIES = [
  {
    id: "Al1",
    tenantId: IDS.organization,
    occurredAt: "2026-10-01T12:00:00.000Z",
    action: "PROJECT_UPDATED",
    actor: { type: "user", id: BRUNO["uid"] },
    target: { type: "project", id: IDS.project },
    outcome: "success",
    requestId: "01K6REQ0000000000000000000",
    changes: ["name", "status"],
  },
  {
    id: "Al2",
    tenantId: IDS.organization,
    occurredAt: "2026-10-01T11:00:00.000Z",
    action: "MEMBERSHIP_REVOKED",
    actor: { type: "service", id: "ApiKey123" },
    target: { type: "membership", id: "Mb1" },
    outcome: "denied",
    requestId: "01K6REQ0000000000000000001",
  },
];

const renderView = (permissions: readonly Permission[], routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <SettingsAuditLogView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/audit-log`,
      routes: shellRoutes(permissions, {
        "GET /v1/organizations/:organizationId/members": page([BRUNO]),
        "GET /v1/organizations/:organizationId/audit-logs": page(ENTRIES),
        ...routes,
      }),
    },
  );

describe("SettingsAuditLogView", () => {
  it("lists who did what, with member names, changed fields and outcomes", async () => {
    const { container } = renderView(["core.organization.read", "core.audit-log.read", "core.member.read"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Auditoria" })).toBeDefined();
    const table = await screen.findByRole("table", { name: "Auditoria de Northwind" });
    await within(table).findByText("Bruno Lima");
    expect(within(table).getByText("Projeto alterado")).toBeDefined();
    expect(within(table).getByText("Campos: name, status")).toBeDefined();
    expect(within(table).getByText("Integração (chave de API)")).toBeDefined();
    expect(within(table).getByText("Negado")).toBeDefined();
    const nav = screen.getByRole("navigation", { name: "Seções das configurações" });
    expect(within(nav).getByRole("link", { name: "Auditoria" }).getAttribute("aria-current")).toBe("page");
    await expectNoAxeViolations(container);
  });

  it("filters by action through the API and keeps the filter in the URL", async () => {
    const actions: (string | null)[] = [];
    const { user, router } = renderView(["core.organization.read", "core.audit-log.read"], {
      "GET /v1/organizations/:organizationId/audit-logs": (request: FakeRequest) => {
        actions.push(request.query.get("action"));
        return page(request.query.get("action") === null ? ENTRIES : []);
      },
    });
    await screen.findByText("Projeto alterado");
    await user.click(screen.getByRole("combobox", { name: "Filtrar por ação" }));
    await user.click(await screen.findByRole("option", { name: "Acesso revogado" }));
    expect(await screen.findByText("Nenhum registro desta ação")).toBeDefined();
    expect(actions).toContain("MEMBERSHIP_REVOKED");
    expect(router.current()).toContain("action=MEMBERSHIP_REVOKED");
  });

  it("shows no-access without core.audit-log.read and calls nothing", async () => {
    const { api } = renderView(["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines()).not.toContain(`GET /v1/organizations/${IDS.organization}/audit-logs`);
  });
  it("has a label for every audited action in every locale", () => {
    for (const [locale, catalog] of Object.entries(CORE_MESSAGES)) {
      const labels = (catalog.settings as { auditLog: { actions: Record<string, string> } }).auditLog.actions;
      expect(
        AUDIT_ACTIONS.filter((action) => labels[action] === undefined),
        locale,
      ).toEqual([]);
    }
  });
});
