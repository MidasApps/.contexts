import { ConversationContract } from "@core/contracts";
import { screen, waitFor } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { apiError, createFakeApi, ok, page, type FakeApi } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { createFakeChatTransport } from "../testing/fake-chat-transport.ts";
import { ChatPanel, type ChatPanelProps } from "./chat-panel.tsx";

const SCOPE = { organizationId: IDS.organization, projectId: IDS.project };
const CONVERSATION_ID = "Cv8sK2lPq0WnR5tYu3bV";

const conversation = (overrides: Record<string, unknown> = {}) => ({ ...(ConversationContract.meta.examples[0] as object), id: CONVERSATION_ID, ...overrides });

const stored: UIMessage[] = [
  { id: "u-0", role: "user", parts: [{ type: "text", text: "Qual é o prazo?" }] },
  { id: "a-0", role: "assistant", parts: [{ type: "text", text: "O prazo é de 30 dias." }] },
];

const historyApi = (overrides: Record<string, unknown> = {}): FakeApi =>
  createFakeApi({
    [`GET /v1/conversations/${CONVERSATION_ID}`]: ok(conversation(overrides)),
    [`GET /v1/conversations/${CONVERSATION_ID}/messages`]: page(stored),
  });

const setup = (props: Partial<ChatPanelProps>, api: FakeApi) =>
  renderWithClient(
    <TooltipProvider>
      <ChatPanel scope={SCOPE} transport={createFakeChatTransport()} {...props} />
    </TooltipProvider>,
    { api },
  );

describe("ChatPanel — history of a stored conversation", () => {
  it("says when earlier messages could not be loaded and loads them on the next try", async () => {
    const api = historyApi();
    const older: UIMessage[] = [{ id: "u-old", role: "user", parts: [{ type: "text", text: "Mensagem antiga" }] }];
    let attempts = 0;
    api.route(`GET /v1/conversations/${CONVERSATION_ID}/messages`, ({ query }) => {
      if (query.get("cursor") !== "1") return page(stored, { cursor: "1" });
      attempts += 1;
      return attempts === 1 ? apiError(500, "INTERNAL_ERROR") : page(older);
    });
    const { user } = setup({ conversationId: CONVERSATION_ID }, api);
    await user.click(await screen.findByRole("button", { name: "Carregar mensagens anteriores" }));
    expect(await screen.findByText("Não foi possível carregar as mensagens anteriores. Tente de novo.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Carregar mensagens anteriores" }));
    expect(await screen.findByText("Mensagem antiga")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Não foi possível carregar as mensagens anteriores. Tente de novo.")).toBeNull());
  });
});
