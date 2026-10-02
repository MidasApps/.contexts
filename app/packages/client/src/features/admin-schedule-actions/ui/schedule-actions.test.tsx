import { AdminScheduleSchema, type AdminSchedule } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminSchedule, buildPlatformSchedule, OPS_IDS } from "#/shared/testing/admin-operations-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { RunScheduleNowDialog } from "./RunScheduleNowDialog.tsx";
import { ScheduleStateDialog, type ScheduleStateRequest } from "./ScheduleStateDialog.tsx";

const TENANT = AdminScheduleSchema.parse(buildAdminSchedule());
const PLATFORM = AdminScheduleSchema.parse(buildPlatformSchedule());

function StateHarness({ request }: { request: ScheduleStateRequest }) {
  const [open, setOpen] = useState<ScheduleStateRequest | null>(request);
  return <ScheduleStateDialog request={open} onOpenChange={(next) => !next && setOpen(null)} />;
}

function RunNowHarness({ schedule }: { schedule: AdminSchedule }) {
  const [open, setOpen] = useState<AdminSchedule | null>(schedule);
  return <RunScheduleNowDialog schedule={open} onOpenChange={(next) => !next && setOpen(null)} />;
}

afterEach(() => setOnline(true));

describe("ScheduleStateDialog", () => {
  it("pauses a platform job only through a destructive confirmation that says every organization stops", async () => {
    const { user, api, container } = renderAdmin(<StateHarness request={{ schedule: PLATFORM, action: "pause" }} />, {
      routes: { "POST /v1/admin/schedules/:scheduleId/pause": ok(buildPlatformSchedule({ status: "paused" })) },
    });
    const dialog = await screen.findByRole("alertdialog", { name: "Pausar o agendamento de Relatório de uso?" });
    expect(dialog.textContent).toContain("deixa de rodar para todas as organizações");
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Pausar job da plataforma" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).toContain(`POST /v1/admin/schedules/${OPS_IDS.platformSchedule}/pause`);
    expect(await screen.findByText("Agendamento de Relatório de uso pausado.")).toBeDefined();
  });

  it("resumes a tenant schedule and keeps the dialog open with the reference when it fails", async () => {
    const { user } = renderAdmin(<StateHarness request={{ schedule: TENANT, action: "resume" }} />, {
      routes: { "POST /v1/admin/schedules/:scheduleId/resume": apiError(503, "UPSTREAM_UNAVAILABLE") },
    });
    const dialog = await screen.findByRole("alertdialog", { name: "Retomar o agendamento de Relatório de uso?" });
    expect(dialog.textContent).toContain("volta a disparar para a organização");
    await user.click(within(dialog).getByRole("button", { name: "Retomar agendamento" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
  });

  it("holds the change while offline", async () => {
    renderAdmin(<StateHarness request={{ schedule: TENANT, action: "pause" }} />);
    const dialog = await screen.findByRole("alertdialog");
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Pausar agendamento" }).disabled).toBe(true));
    expect(within(dialog).getByText(/Você está sem conexão/u)).toBeDefined();
  });
});

describe("RunScheduleNowDialog", () => {
  it("starts an extra run of a tenant schedule as its creator, pending until the API answers", async () => {
    const held = holdResponse();
    const { user, api } = renderAdmin(<RunNowHarness schedule={TENANT} />, { routes: { "POST /v1/admin/schedules/:scheduleId/run": held.handler } });
    const dialog = await screen.findByRole("alertdialog", { name: "Executar Relatório de uso agora?" });
    expect(dialog.textContent).toContain("em nome de quem criou o agendamento");
    await user.click(within(dialog).getByRole("button", { name: "Executar agora" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Executar agora" }).getAttribute("aria-busy")).toBe("true"));
    held.release(ok({ scheduleId: OPS_IDS.tenantSchedule }, 202));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).toContain(`POST /v1/admin/schedules/${OPS_IDS.tenantSchedule}/run`);
    expect(await screen.findByText("Execução de Relatório de uso solicitada.")).toBeDefined();
  });

  it("says a platform job runs for every organization and shows a failure with its reference", async () => {
    const { user } = renderAdmin(<RunNowHarness schedule={PLATFORM} />, { routes: { "POST /v1/admin/schedules/:scheduleId/run": apiError(409, "CONFLICT") } });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("para todas as organizações");
    await user.click(within(dialog).getByRole("button", { name: "Executar agora" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
  });

  it("holds the run while offline", async () => {
    renderAdmin(<RunNowHarness schedule={TENANT} />);
    const dialog = await screen.findByRole("alertdialog");
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Executar agora" }).disabled).toBe(true));
  });
});
