import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { ScheduleTable, type ScheduleRow } from "./ScheduleTable.tsx";

const ROW: ScheduleRow = {
  id: "schedule_3fa9c0e1b2d4a6f8-daily-usage",
  tenantId: "org-1",
  workflowId: "usage-report",
  cron: "0 9 * * 1-5",
  timezone: "America/Sao_Paulo",
  status: "active",
  nextFireAt: "2026-10-05T12:00:00.000Z",
  lastFireAt: "2026-10-02T12:00:00.000Z",
};

const renderTable = (rows: readonly ScheduleRow[] = [ROW]) =>
  renderWithProviders(
    <ScheduleTable caption="Agendamentos" schedules={rows} canManage pendingId={null} onPause={vi.fn()} onResume={vi.fn()} onRunNow={vi.fn()} empty={<p>vazio</p>} />,
  );

const useMobileViewport = (): void => {
  const matchMedia = globalThis.matchMedia;
  beforeEach(() => {
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
  });
  afterEach(() => {
    globalThis.matchMedia = matchMedia;
  });
};

describe("ScheduleTable", () => {
  it("names the workflow and the schedule's slug instead of their ids", () => {
    renderTable();
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText("Relatório de uso")).toBeDefined();
    expect(within(row).getByText("daily-usage")).toBeDefined();
    expect(within(row).queryByText(ROW.id)).toBeNull();
    expect(within(row).getByRole("button", { name: "Pausar o agendamento daily-usage de Relatório de uso" })).toBeDefined();
  });

  it("keeps pause and run-now on the row and groups the caller's actions in a menu", async () => {
    const onEdit = vi.fn();
    const { user } = renderWithProviders(
      <ScheduleTable
        caption="Agendamentos"
        schedules={[ROW]}
        canManage
        pendingId={null}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onRunNow={vi.fn()}
        rowMenuItems={() => [
          { id: "edit", label: "Editar", accessibleLabel: "Editar o agendamento daily-usage", onSelect: onEdit },
          { id: "delete", label: "Excluir", onSelect: vi.fn(), destructive: true, disabled: true },
        ]}
        empty={<p>vazio</p>}
      />,
    );
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Pausar o agendamento daily-usage de Relatório de uso",
      "Executar agora o agendamento daily-usage de Relatório de uso",
      "Mais ações do agendamento daily-usage de Relatório de uso",
    ]);
    await user.click(within(row).getByRole("button", { name: /^Mais ações/u }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Excluir" }).getAttribute("aria-disabled")).toBe("true");
    await user.click(within(menu).getByRole("menuitem", { name: "Editar o agendamento daily-usage" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows no menu when the caller has no more actions", () => {
    renderTable();
    expect(screen.queryByRole("button", { name: /^Mais ações/u })).toBeNull();
  });

  it("describes a preset cron in words and keeps the expression as secondary text", () => {
    renderTable();
    expect(screen.getByText("Dias úteis às 09:00")).toBeDefined();
    expect(screen.getByText("0 9 * * 1-5")).toBeDefined();
  });

  it("shows a custom cron as written", () => {
    renderTable([{ ...ROW, cron: "*/15 * * * *" }]);
    expect(screen.getByText("*/15 * * * *")).toBeDefined();
  });

  describe("on phones", () => {
    useMobileViewport();

    it("shows the last fire on the card too", () => {
      renderTable();
      expect(screen.getByText(/Último disparo/u)).toBeDefined();
      expect(screen.getByText(/Próximo disparo/u)).toBeDefined();
    });
  });
});
