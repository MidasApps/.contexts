import { ConversationContract } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createFakeApi, type FakeApi, type FakeRequest, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { createFakeChatTransport } from "../testing/fake-chat-transport.ts";
import { ChatPanel } from "./chat-panel.tsx";

const SCOPE = { organizationId: IDS.organization, projectId: IDS.project };
const CONVERSATION_ID = "Cv8sK2lPq0WnR5tYu3bV";
const stored: UIMessage[] = [
  { id: "u-0", role: "user", parts: [{ type: "text", text: "Qual é o prazo?" }] },
  { id: "a-0", role: "assistant", parts: [{ type: "text", text: "O prazo é de 30 dias." }] },
];

const setup = (can: (permission: string) => boolean) => {
  const bodies: unknown[] = [];
  const api: FakeApi = createFakeApi({
    [`GET /v1/conversations/${CONVERSATION_ID}`]: ok({
      ...(ConversationContract.meta.examples[0] as object),
      id: CONVERSATION_ID,
    }),
    [`GET /v1/conversations/${CONVERSATION_ID}/messages`]: page(stored),
    [`POST /v1/conversations/${CONVERSATION_ID}/feedback`]: (request: FakeRequest) => {
      bodies.push(request.body);
      const body = request.body as { messageId: string; rating: string };
      return ok({
        conversationId: CONVERSATION_ID,
        tenantId: IDS.organization,
        userId: IDS.user,
        messageId: body.messageId,
        rating: body.rating,
        createdAt: "2026-10-05T12:00:00.000Z",
        updatedAt: "2026-10-05T12:00:00.000Z",
      });
    },
  });
  const rendered = renderWithClient(
    <TooltipProvider>
      <ChatPanel scope={SCOPE} transport={createFakeChatTransport()} conversationId={CONVERSATION_ID} can={can} />
    </TooltipProvider>,
    { api },
  );
  return { ...rendered, bodies };
};

describe("ChatPanel — rating answers", () => {
  it("sends thumbs up at once and keeps it pressed", async () => {
    const { user, bodies } = setup(() => true);
    await user.click(await screen.findByRole("button", { name: "Resposta boa" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resposta boa" }).getAttribute("aria-pressed")).toBe("true"),
    );
    expect(bodies).toEqual([{ messageId: "a-0", rating: "up" }]);
  });

  it("asks what went wrong on thumbs down, with the dataset choice for eval writers", async () => {
    const { user, bodies } = setup((permission) => permission === "core.eval.write");
    await user.click(await screen.findByRole("button", { name: "Resposta ruim" }));
    const dialog = await screen.findByRole("dialog", { name: "O que não ficou bom?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Comentário" }), "Citou o documento errado.");
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Usar esta resposta nas avaliações da organização" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Enviar avaliação" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Resposta ruim" }).getAttribute("aria-pressed")).toBe("true");
    expect(bodies).toEqual([
      { messageId: "a-0", rating: "down", comment: "Citou o documento errado.", addToDataset: true },
    ]);
  });

  it("offers no dataset choice without core.eval.write", async () => {
    const { user } = setup(() => false);
    await user.click(await screen.findByRole("button", { name: "Resposta ruim" }));
    const dialog = await screen.findByRole("dialog", { name: "O que não ficou bom?" });
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
  });
});
