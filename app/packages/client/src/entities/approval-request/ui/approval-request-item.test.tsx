import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { ApprovalRequestItem } from "./approval-request-item.tsx";

describe("ApprovalRequestItem", () => {
  it("shows a workflow request with its status, requester and a link to the run", { timeout: 20_000 }, async () => {
    const { container } = renderApp(<ApprovalRequestItem request={buildApprovalRequest()} requesterName="Mia" node="Toda a organização" />);
    expect(await screen.findByRole("heading", { name: "Create the note \"Follow-up\"" })).toBeTruthy();
    expect(screen.getByText("Pendente")).toBeTruthy();
    expect(screen.getByText(/Pedida por Mia/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver o progresso do fluxo" }).getAttribute("href")).toBe("/o/OrgAaaaaaaaaaaaaaaaaa/settings/workflows/runs/run-1");
    expect(screen.getByText("Toda a organização")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("shows the before/after of an agent command in English", async () => {
    const request = buildApprovalRequest({ action: { kind: "agent-command", input: { preview: { before: { name: "A" }, after: { name: "B" } } }, summary: "Rename project" } });
    renderApp(<ApprovalRequestItem request={request} />, { locale: "en-US" });
    expect(await screen.findByText("Before")).toBeTruthy();
    expect(screen.getByText(/"name": "B"/)).toBeTruthy();
  });
});
