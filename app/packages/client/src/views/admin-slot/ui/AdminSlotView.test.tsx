import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import type { ShellNavItem } from "#/shared/lib/shell/shell-types.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { AdminSlotView } from "./AdminSlotView.tsx";

const STAFF_MANAGE: ShellNavItem = {
  id: "core.admin.staff",
  slot: "admin",
  labelKey: "shell.nav.admin.users",
  icon: "shield",
  permission: "platform.staff.manage",
  order: 5,
  target: { kind: "admin", rest: "staff" },
};

const renderSlot = (path: string) =>
  renderApp(
    <main>
      <AdminSlotView />
    </main>,
    {
      path,
      navigation: [STAFF_MANAGE],
      routes: { "GET /v1/me": ok(buildMe({ isPlatformStaff: true, platformRole: "platform-support" })) },
    },
  );

describe("AdminSlotView", () => {
  it("renders the area's empty state until its page exists, with a way back", async () => {
    const { container } = renderSlot("/admin/costs");
    expect(await screen.findByRole("heading", { level: 1, name: "Custos" })).toBeDefined();
    expect(screen.getByText("Uso e custos por organização.")).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "Ainda não disponível" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Voltar à administração" }).getAttribute("href")).toBe("/admin");
    await expectNoAxeViolations(container);
  });

  it("keeps sub-pages of an area in that area", async () => {
    renderSlot("/admin/users/u-42");

    expect(await screen.findByRole("heading", { level: 1, name: "Usuários" })).toBeDefined();
  });

  it("is not found for an unknown area or one the role cannot open", async () => {
    const unknown = renderSlot("/admin/nope");
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    unknown.unmount();

    renderSlot("/admin/staff");
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
});
