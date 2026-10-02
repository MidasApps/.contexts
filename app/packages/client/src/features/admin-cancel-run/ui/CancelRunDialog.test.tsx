import { AdminWorkflowRunSchema, type AdminWorkflowRun } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminRun, OPS_IDS } from "#/shared/testing/admin-operations-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, noContent, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { CancelRunDialog } from "./CancelRunDialog.tsx";

const CANCEL = "POST /v1/admin/workflow-runs/:runId/cancel";

function Harness({ run }: { run: AdminWorkflowRun }) {
  const [open, setOpen] = useState<AdminWorkflowRun | null>(run);
  return <CancelRunDialog run={open} onOpenChange={(next) => !next && setOpen(null)} />;
}

const render = (routes: FakeRoutes, overrides: Record<string, unknown> = {}) =>
  renderAdmin(<Harness run={AdminWorkflowRunSchema.parse(buildAdminRun(overrides))} />, { routes });

afterEach(() => setOnline(true));

describe("CancelRunDialog", () => {
  it("cancels the run after the confirmation, closes and says so", async () => {
    const { user, api, container } = render({ [CANCEL]: noContent() });
    const dialog = await screen.findByRole("alertdialog", { name: "Cancelar a execução de Demonstração de aprovação?" });
    expect(dialog.textContent).toContain("A solicitação de aprovação que ela aguardava continua aberta");
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar execução" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).toContain(`POST /v1/admin/workflow-runs/${OPS_IDS.run}/cancel`);
    expect(await screen.findByText("Execução de Demonstração de aprovação cancelada.")).toBeDefined();
  });

  it("does not mention an approval for a run that waits for none", async () => {
    render({}, { approvalRequestId: null, status: "running" });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("A execução para agora e não pode ser retomada.");
    expect(dialog.textContent).not.toContain("aprovação que ela aguardava");
  });

  it("shows the request as pending and keeps the dialog from closing until the API answers", async () => {
    const held = holdResponse();
    const { user } = render({ [CANCEL]: held.handler });
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar execução" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancelar execução" }).getAttribute("aria-busy")).toBe("true"));
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Manter execução" }).disabled).toBe(true);
    held.release(noContent());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the dialog open with the error and its reference when the cancel fails", async () => {
    const { user } = render({ [CANCEL]: apiError(409, "CONFLICT") });
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar execução" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    expect(screen.getByRole("alertdialog")).toBeDefined();
  });

  it("holds the cancel while offline and says why", async () => {
    const { api } = render({ [CANCEL]: noContent() });
    const dialog = await screen.findByRole("alertdialog");
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Cancelar execução" }).disabled).toBe(true));
    expect(within(dialog).getByText(/Você está sem conexão/u)).toBeDefined();
    expect(api.callLines()).not.toContain(`POST /v1/admin/workflow-runs/${OPS_IDS.run}/cancel`);
  });
});
