import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { RunTimeline, type RunTimelineRun } from "./RunTimeline.tsx";

const RUN: RunTimelineRun = {
  status: "running",
  startedBy: "uA1b2C3d4E5f6G7h8I9j",
  scheduleId: null,
  approvalRequestId: null,
  failure: null,
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T15:00:00.000Z",
};

const steps = (): string[] =>
  within(screen.getByRole("list", { name: "Linha do tempo" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");

const render = (run: Partial<RunTimelineRun>, props: Partial<Parameters<typeof RunTimeline>[0]> = {}) =>
  renderWithProviders(<RunTimeline run={{ ...RUN, ...run }} label="Linha do tempo" {...props} />, {
    timeZone: "America/Sao_Paulo",
  });

describe("RunTimeline", () => {
  it("shows who started the run and its current status since the last change", async () => {
    const { container } = render({}, { starterLabel: "Ana Souza" });
    const [started, current] = steps();
    expect(started).toContain("Iniciada");
    expect(started).toContain("Pelo usuário Ana Souza");
    expect(current).toContain("Estado atual");
    expect(current).toContain("Desde");
    expect(current).toContain("Em execução");
    await expectNoAxeViolations(container);
  });

  it("says a schedule started it in words, never by its id, and the platform when nobody did", () => {
    const scheduled = render(
      { scheduleId: "schedule_3fa9c0e1b2d4a6f8-daily-usage" },
      { scheduleLabel: "todo dia às 09:00" },
    );
    expect(steps()[0]).toContain("Por um agendamento: todo dia às 09:00");
    scheduled.unmount();
    const anySchedule = render({ scheduleId: "schedule_3fa9c0e1b2d4a6f8-daily-usage" });
    expect(steps()[0]).toContain("Por um agendamento");
    expect(steps()[0]).not.toContain("schedule_3fa9");
    anySchedule.unmount();
    render({ startedBy: null });
    expect(steps()[0]).toContain("Pela plataforma");
  });

  it("shows the approval a suspended run waits for, through the caller's link", () => {
    render(
      { status: "suspended", approvalRequestId: "Ap1rQ2sT3uV4wX5yZ6aB" },
      { renderApproval: (id) => <a href={`/approvals/${id}`}>Abrir aprovação</a> },
    );
    expect(steps()).toHaveLength(3);
    expect(steps()[1]).toContain("Aguarda aprovação");
    expect(screen.getByRole("link", { name: "Abrir aprovação" }).getAttribute("href")).toBe(
      "/approvals/Ap1rQ2sT3uV4wX5yZ6aB",
    );
  });

  it("says why a run failed by its code and step, never the error itself", () => {
    render({ status: "failed", failure: { code: "STEP_FAILED", stepId: "send-report" } });
    const failed = steps()[1] ?? "";
    expect(failed).toContain("Uma etapa falhou");
    expect(failed).toContain("Etapa: send-report");
    expect(steps()[2]).toContain("Falhou");
  });
});
