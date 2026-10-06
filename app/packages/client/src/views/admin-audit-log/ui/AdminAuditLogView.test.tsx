import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { type FakeRequest, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminAuditLogView } from "./AdminAuditLogView.tsx";

const ENTRIES = [
  {
    id: "Pa1",
    occurredAt: "2026-10-01T12:00:00.000Z",
    action: "TENANT_BUDGET_UPDATED",
    actor: { type: "user", id: "staff-1" },
    target: { type: "organization", id: IDS.organization },
    targetTenantId: IDS.organization,
    outcome: "success",
    requestId: "01K6REQ0000000000000000000",
  },
  {
    id: "Pa2",
    occurredAt: "2026-10-01T11:00:00.000Z",
    action: "PLAN_DELETED",
    actor: { type: "user", id: "staff-1" },
    target: { type: "plan", id: "PlanX" },
    outcome: "success",
    requestId: "01K6REQ0000000000000000001",
  },
];

describe("AdminAuditLogView", () => {
  it("lists staff actions with the organization they touched, also to support staff", async () => {
    const { container } = renderAdmin(<AdminAuditLogView />, {
      path: "/admin/audit",
      role: "platform-support",
      routes: { "GET /v1/admin/audit-logs": page(ENTRIES) },
    });
    const table = await screen.findByRole("table", { name: "Auditoria da plataforma" });
    expect(await within(table).findByText("Orçamento da organização alterado")).toBeDefined();
    expect(within(table).getByText("Plano excluído")).toBeDefined();
    expect(within(table).getByRole("link", { name: IDS.organization }).getAttribute("href")).toContain(
      `/admin/organizations/${IDS.organization}`,
    );
    expect(within(table).getByText("Toda a plataforma")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("filters by action and by organization through the API", async () => {
    const queries: string[] = [];
    const { user } = renderAdmin(<AdminAuditLogView />, {
      path: `/admin/audit?organizationId=${IDS.organization}`,
      routes: {
        "GET /v1/admin/audit-logs": (request: FakeRequest) => {
          queries.push(request.query.toString());
          return page(ENTRIES.slice(0, 1));
        },
      },
    });
    expect(await screen.findByText("Só da organização")).toBeDefined();
    await user.click(screen.getByRole("combobox", { name: "Filtrar por ação" }));
    await user.click(await screen.findByRole("option", { name: "Plano excluído" }));
    await screen.findByText("Orçamento da organização alterado");
    expect(queries.some((query) => query.includes("action=PLAN_DELETED") && query.includes("organizationId="))).toBe(
      true,
    );
  });
});
