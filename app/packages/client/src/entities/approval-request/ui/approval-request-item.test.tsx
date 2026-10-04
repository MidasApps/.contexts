import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { ApprovalRequestItem } from "./approval-request-item.tsx";

describe("ApprovalRequestItem", () => {
  it("shows a workflow request with its status, requester and a link to the run", { timeout: 20_000 }, async () => {
    const { container } = renderApp(
      <ApprovalRequestItem request={buildApprovalRequest()} requesterName="Mia" node="Toda a organização" />,
    );
    expect(await screen.findByRole("heading", { name: 'Create the note "Follow-up"' })).toBeTruthy();
    expect(screen.getByText("Pendente")).toBeTruthy();
    expect(screen.getByText(/Pedida por Mia/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver o progresso do fluxo" }).getAttribute("href")).toBe(
      "/o/OrgAaaaaaaaaaaaaaaaaa/settings/workflows/runs/run-1",
    );
    expect(screen.getByText("Toda a organização")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("says why an approved action failed and quotes its reference (decision 0067)", async () => {
    const interrupted = buildApprovalRequest({
      status: "failed",
      decidedBy: "admin-uid",
      failure: { code: "EXECUTION_INTERRUPTED", requestId: "01J9Z3K8M2Q4R6T8V0W2X4Y6Z8" },
    });
    const { container, unmount } = renderApp(<ApprovalRequestItem request={interrupted} />);
    expect(await screen.findByText(/A execução foi interrompida antes de terminar/u)).toBeTruthy();
    expect(screen.getByText("Referência: 01J9Z3K8M2Q4R6T8V0W2X4Y6Z8 (EXECUTION_INTERRUPTED)")).toBeTruthy();
    await expectNoAxeViolations(container);
    unmount();
    // A module's own code has no copy of its own: the generic reason; the code stays beside the reference.
    renderApp(
      <ApprovalRequestItem request={{ ...interrupted, failure: { code: "INVOICE_LOCKED", requestId: "req-7" } }} />,
      { locale: "en-US" },
    );
    expect(await screen.findByText("The action returned an error while running.")).toBeTruthy();
    expect(screen.getByText("Reference: req-7 (INVOICE_LOCKED)")).toBeTruthy();
  });

  it("shows the before/after of an agent command in English", async () => {
    const request = buildApprovalRequest({
      action: {
        kind: "agent-command",
        input: { preview: { before: { name: "A" }, after: { name: "B" } } },
        summary: "Rename project",
      },
    });
    renderApp(<ApprovalRequestItem request={request} />, { locale: "en-US" });
    expect(await screen.findByText("Before")).toBeTruthy();
    expect(screen.getByText(/"name": "B"/)).toBeTruthy();
  });
});
