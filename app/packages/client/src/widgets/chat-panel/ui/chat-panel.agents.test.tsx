import { ConversationContract } from "@core/contracts";
import { screen, waitFor } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { apiError, createFakeApi, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { ChatPanel } from "./chat-panel.tsx";

// Decision 0046: which agent answers a conversation, picked while it is new and fixed afterwards.
const SCOPE = { organizationId: IDS.organization, projectId: IDS.project };
const CONVERSATION_ID = "Cv8sK2lPq0WnR5tYu3bV";
const ASSISTANT = { id: "assistant", name: "Assistant", description: "Plans the work.", source: "core" };
const GUIDE = { id: "Ag4sK2lPq0WnR5tYu3bV", name: "Onboarding guide", description: "Answers new members.", source: "custom" };
const stored: UIMessage[] = [
  { id: "u-0", role: "user", parts: [{ type: "text", text: "Por onde começo?" }] },
  { id: "a-0", role: "assistant", parts: [{ type: "text", text: "Pelo guia de boas-vindas." }] },
];

const render = (routes: Parameters<typeof createFakeApi>[0], conversationId?: string) => {
  const api = createFakeApi({ "GET /v1/chat-agents": ok([ASSISTANT, GUIDE]), ...routes });
  const view = renderWithClient(
    <TooltipProvider>
      <ChatPanel scope={SCOPE} conversationId={conversationId} />
    </TooltipProvider>,
    { api },
  );
  return { ...view, api };
};

const storedConversation = (agentId: string) => ({
  [`GET /v1/conversations/${CONVERSATION_ID}`]: ok({ ...(ConversationContract.meta.examples[0] as object), id: CONVERSATION_ID, agentId, activeRunId: null }),
  [`GET /v1/conversations/${CONVERSATION_ID}/messages`]: page(stored),
});

const chatCall = (api: ReturnType<typeof render>["api"]) => api.calls.find((call) => call.method === "POST" && call.path === "/v1/chat");

describe("ChatPanel agents", () => {
  it("starts a new conversation with the picked agent", async () => {
    // The send fails on purpose: only the request body matters here.
    const { user, api } = render({ "POST /v1/chat": apiError(503, "UPSTREAM_UNAVAILABLE") });
    const picker = screen.getByRole("combobox", { name: "Agente" });
    await waitFor(() => expect(picker.hasAttribute("disabled")).toBe(false));
    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: "Onboarding guide" }));
    await user.type(screen.getByRole("textbox", { name: "Mensagem" }), "Olá{Enter}");
    await waitFor(() => expect(chatCall(api)).toBeDefined());
    expect(chatCall(api)?.body).toMatchObject({ organizationId: IDS.organization, projectId: IDS.project, agentId: GUIDE.id });
  });

  it("sends no agent for the assistant, so the default of the server applies", async () => {
    const { user, api } = render({ "POST /v1/chat": apiError(503, "UPSTREAM_UNAVAILABLE") });
    await user.type(screen.getByRole("textbox", { name: "Mensagem" }), "Olá{Enter}");
    await waitFor(() => expect(chatCall(api)).toBeDefined());
    expect(chatCall(api)?.body).not.toHaveProperty("agentId");
  });

  it("shows the agent of a stored conversation instead of the picker, on the header and on its answers", async () => {
    render(storedConversation(GUIDE.id), CONVERSATION_ID);
    expect(await screen.findByText("Pelo guia de boas-vindas.")).toBeTruthy();
    expect(await screen.findByText("Agente: Onboarding guide")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Agente" })).toBeNull();
    expect(screen.getByRole("article", { name: "Onboarding guide" }).textContent).toContain("Pelo guia de boas-vindas.");
  });

  it("names an agent that is no longer listed generically", async () => {
    render(storedConversation("AgGone00000000000001"), CONVERSATION_ID);
    expect(await screen.findByText("Agente: Agente da organização")).toBeTruthy();
  });
});
