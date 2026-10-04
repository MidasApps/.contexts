import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { type ScheduleRow, ScheduleTable } from "./ScheduleTable.tsx";

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
    <ScheduleTable
      caption="Agendamentos"
      schedules={rows}
      canManage
      pendingId={null}
      onPause={vi.fn()}
      onResume={vi.fn()}
      onRunNow={vi.fn()}
      empty={<p>vazio</p>}
    />,
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
  it("shows the next fire in the schedule's zone, and in the viewer's zone only when they differ", () => {
    const tokyo = { ...ROW, timezone: "Asia/Tokyo" };
    const view = renderWithProviders(
      <ScheduleTable
        caption="Agendamentos"
        schedules={[tokyo]}
        canManage
        pendingId={null}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onRunNow={vi.fn()}
        empty={<p>vazio</p>}
      />,
      { timeZone: "America/Sao_Paulo" },
    );
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText("5 de out. de 2026, 21:00 (Asia/Tokyo)")).toBeDefined();
    expect(within(row).getByText("5 de out. de 2026, 09:00 no seu fuso (America/Sao_Paulo)")).toBeDefined();
    view.unmount();
    renderWithProviders(
      <ScheduleTable
        caption="Agendamentos"
        schedules={[ROW]}
        canManage
        pendingId={null}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onRunNow={vi.fn()}
        empty={<p>vazio</p>}
      />,
      { timeZone: "America/Sao_Paulo" },
    );
    expect(within(screen.getAllByRole("row")[1]!).queryByText(/no seu fuso/u)).toBeNull();
  });

  it("names the workflow and the schedule's slug instead of their ids", () => {
    renderTable();
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText("Relatório de uso")).toBeDefined();
    expect(within(row).getByText("daily-usage")).toBeDefined();
    expect(within(row).queryByText(ROW.id)).toBeNull();
    expect(
      within(row).getByRole("button", { name: "Pausar o agendamento daily-usage de Relatório de uso" }),
    ).toBeDefined();
  });

  it("names a platform schedule's actions by its workflow alone, since it has no slug", () => {
    renderTable([{ ...ROW, id: "schedule_platform-catalog-reindex", workflowId: "catalog-reindex", status: "paused" }]);
    const row = screen.getAllByRole("row")[1]!;
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Retomar o agendamento de Reindexação do catálogo",
      "Executar agora o agendamento de Reindexação do catálogo",
    ]);
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
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
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
