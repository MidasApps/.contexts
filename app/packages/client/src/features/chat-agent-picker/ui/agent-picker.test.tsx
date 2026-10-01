import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, createFakeApi, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { AgentPicker } from "./agent-picker.tsx";

const ASSISTANT = { id: "assistant", name: "Assistant", description: "Plans the work.", source: "core" };
const GUIDE = { id: "Ag4sK2lPq0WnR5tYu3bV", name: "Onboarding guide", description: "Answers new members.", source: "custom" };

const setup = (routes: Parameters<typeof createFakeApi>[0], value = "assistant") => {
  const onChange = vi.fn();
  const view = renderWithClient(<AgentPicker organizationId={IDS.organization} value={value} onChange={onChange} />, { api: createFakeApi(routes) });
  return { ...view, onChange };
};

describe("AgentPicker", () => {
  it("offers the assistant and the organization's agents, and reports the pick", async () => {
    const { user, onChange, container, api } = setup({ "GET /v1/chat-agents": ok([ASSISTANT, GUIDE]) });
    const trigger = screen.getByRole("combobox", { name: "Agente" });
    await waitFor(() => expect(trigger.hasAttribute("disabled")).toBe(false));
    expect(trigger.textContent).toContain("Assistente");
    await expectNoAxeViolations(container);
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Onboarding guide" }));
    expect(onChange).toHaveBeenCalledWith(GUIDE.id);
    expect(api.calls.find((call) => call.path === "/v1/chat-agents")?.query).toBe(`?organizationId=${IDS.organization}`);
  });

  it("says that only the assistant is available when the organization has no agent, or the member may not list them", async () => {
    for (const answer of [ok([ASSISTANT]), apiError(403, "FORBIDDEN")]) {
      const { unmount } = setup({ "GET /v1/chat-agents": answer });
      expect(await screen.findByText("Nenhum agente da organização disponível.")).toBeTruthy();
      expect(screen.getByRole("combobox", { name: "Agente" }).hasAttribute("disabled")).toBe(true);
      unmount();
    }
  });

  it("says that the list failed, keeps the assistant and retries", async () => {
    let failing = true;
    const { user } = setup({ "GET /v1/chat-agents": () => (failing ? apiError(500, "INTERNAL_ERROR") : ok([ASSISTANT, GUIDE])) });
    expect(await screen.findByText("Não foi possível carregar os agentes.", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Agente" }).textContent).toContain("Assistente");
    failing = false;
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Agente" }).hasAttribute("disabled")).toBe(false));
  });

  it("falls back to the assistant when the chosen agent is no longer listed", async () => {
    setup({ "GET /v1/chat-agents": ok([ASSISTANT]) }, GUIDE.id);
    await screen.findByText("Nenhum agente da organização disponível.");
    expect(screen.getByRole("combobox", { name: "Agente" }).textContent).toContain("Assistente");
  });
});
