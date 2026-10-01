import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { ApprovalRequestItem } from "./approval-request-item.tsx";

describe("ApprovalRequestItem", () => {
  it("shows a workflow request with its status, requester and a link to the run", async () => {
    const { container } = renderWithProviders(<ApprovalRequestItem request={buildApprovalRequest()} requesterName="Mia" />);
    expect(screen.getByRole("heading", { name: "Create the note \"Follow-up\"" })).toBeTruthy();
    expect(screen.getByText("Pendente")).toBeTruthy();
    expect(screen.getByText(/Pedida por Mia/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver o progresso do fluxo" }).getAttribute("href")).toBe("/settings/workflows/runs/run-1");
    await expectNoAxeViolations(container);
  });

  it("shows the before/after of an agent command in English", () => {
    const request = buildApprovalRequest({ action: { kind: "agent-command", input: { preview: { before: { name: "A" }, after: { name: "B" } } }, summary: "Rename project" } });
    renderWithProviders(<ApprovalRequestItem request={request} />, { locale: "en-US" });
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getByText(/"name": "B"/)).toBeTruthy();
  });
});
