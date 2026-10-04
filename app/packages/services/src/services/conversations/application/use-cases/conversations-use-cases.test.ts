import type { Conversation, ProjectId, TenantId, UserId } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createInMemoryConversationRepository } from "../../adapters/driven/in-memory-conversation-repository.ts";
import { createConversationsServices } from "../../composition.ts";
import { createConversation } from "../../domain/conversation.ts";

const NOW = "2026-09-30T12:00:00.000Z";
const owner = "user-1" as UserId;
const tenantId = "org-1" as TenantId;

const setup = (seed: Conversation[] = [], now = NOW) => {
  const conversations = createInMemoryConversationRepository(seed);
  return { conversations, services: createConversationsServices({ conversations, clock: fixedClock(now) }) };
};

const conversationOf = (id: string, fields: Partial<Conversation> = {}): Conversation => ({
  ...createConversation(
    { id: id as Conversation["id"], tenantId, projectId: null, ownerId: owner, agentId: "assistant" },
    new Date(NOW),
  ),
  ...fields,
});

describe("conversations use cases", () => {
  it("starts an untitled conversation owned by the caller", async () => {
    const { services, conversations } = setup();
    const started = await services.startConversation({
      tenantId,
      projectId: "p1" as ProjectId,
      ownerId: owner,
      agentId: "assistant",
    });
    expect(started).toMatchObject({
      ownerId: owner,
      projectId: "p1",
      title: null,
      titleSource: "auto",
      messageCount: 0,
      activeRunId: null,
    });
    expect(conversations.all()).toEqual([started]);
  });

  it("hides another member's and deleted conversations", async () => {
    const { services } = setup([
      conversationOf("c1", { ownerId: "user-2" as UserId }),
      conversationOf("c2", { deletedAt: NOW }),
    ]);
    expect(await services.getConversation({ conversationId: "c1", ownerId: owner })).toEqual({
      ok: false,
      error: { code: "CONVERSATION_NOT_FOUND" },
    });
    expect(await services.getConversation({ conversationId: "c2", ownerId: owner })).toEqual({
      ok: false,
      error: { code: "CONVERSATION_NOT_FOUND" },
    });
    expect(
      (await services.updateConversation({ conversationId: "c1", ownerId: owner, patch: { pinned: true } })).ok,
    ).toBe(false);
  });

  it("lists pinned first, then the most recent turn, without archived ones", async () => {
    const { services } = setup([
      conversationOf("a", { lastMessageAt: "2026-09-30T10:00:00.000Z" }),
      conversationOf("b", { lastMessageAt: "2026-09-30T11:00:00.000Z" }),
      conversationOf("c", { lastMessageAt: "2026-09-29T11:00:00.000Z", pinned: true }),
      conversationOf("d", { archivedAt: NOW }),
    ]);
    const page = await services.listConversations({ tenantId, ownerId: owner, page: { after: undefined, limit: 2 } });
    expect(page.items.map((item) => item.id)).toEqual(["c", "b"]);
    expect(page.nextCursor).not.toBeNull();
    const archived = await services.listConversations({
      tenantId,
      ownerId: owner,
      archived: true,
      page: { after: undefined, limit: 10 },
    });
    expect(archived.items.map((item) => item.id)).toEqual(["d"]);
  });

  it("searches folded tokens and lists nothing for a query without words", async () => {
    const { services } = setup([
      conversationOf("a", { searchTokens: ["integracao"] }),
      conversationOf("b", { searchTokens: ["vendas"] }),
    ]);
    const found = await services.listConversations({
      tenantId,
      ownerId: owner,
      q: "Integração",
      page: { after: undefined, limit: 10 },
    });
    expect(found.items.map((item) => item.id)).toEqual(["a"]);
    expect(
      (await services.listConversations({ tenantId, ownerId: owner, q: "!", page: { after: undefined, limit: 10 } }))
        .items,
    ).toEqual([]);
  });

  it("renames with titleSource user, refreshes search tokens and archives", async () => {
    const { services } = setup([conversationOf("a")]);
    const renamed = await services.updateConversation({
      conversationId: "a",
      ownerId: owner,
      patch: { title: "Plano de Ação", archived: true },
    });
    expect(renamed).toMatchObject({
      ok: true,
      data: { title: "Plano de Ação", titleSource: "user", searchTokens: ["plano", "de", "acao"], archivedAt: NOW },
    });
  });

  it("deletes messages first, then soft-deletes; a failed thread delete keeps the conversation", async () => {
    const { services, conversations } = setup([conversationOf("a")]);
    expect(
      await services.deleteConversation({
        conversationId: "a",
        ownerId: owner,
        deleteMessages: () => Promise.resolve(false),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "THREAD_DELETE_FAILED" },
    });
    expect((await conversations.get("a"))?.deletedAt).toBeNull();
    expect(
      await services.deleteConversation({
        conversationId: "a",
        ownerId: owner,
        deleteMessages: () => Promise.resolve(true),
      }),
    ).toMatchObject({ ok: true, data: { deletedAt: NOW } });
  });

  it("refuses to delete a conversation that is streaming", async () => {
    const { services } = setup([conversationOf("a", { activeRunId: "run-1", activeStreamStartedAt: NOW })]);
    expect(
      await services.deleteConversation({
        conversationId: "a",
        ownerId: owner,
        deleteMessages: () => Promise.resolve(true),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "CONVERSATION_STREAMING" },
    });
  });

  it("ends only the active run, counts its turn once and copies the automatic title", async () => {
    const { services } = setup([conversationOf("a")]);
    await services.activeRuns.start({ conversationId: "a" as Conversation["id"], runId: "run-1" });
    const stale = await services.activeRuns.end({ conversationId: "a" as Conversation["id"], runId: "run-0" });
    expect(stale).toMatchObject({ activeRunId: "run-1", messageCount: 0 });
    const ended = await services.activeRuns.end({
      conversationId: "a" as Conversation["id"],
      runId: "run-1",
      title: "Onboarding plan",
    });
    expect(ended).toMatchObject({
      activeRunId: null,
      activeStreamStartedAt: null,
      title: "Onboarding plan",
      searchTokens: ["onboarding", "plan"],
      messageCount: 2,
    });
    expect(await services.activeRuns.end({ conversationId: "a" as Conversation["id"], runId: "run-1" })).toMatchObject({
      messageCount: 2,
    });
  });

  it("never overwrites a title the owner chose", async () => {
    const { services } = setup([conversationOf("a", { title: "Mine", titleSource: "user" })]);
    expect(
      await services.activeRuns.end({ conversationId: "a" as Conversation["id"], runId: "run-1", title: "Generated" }),
    ).toMatchObject({ title: "Mine" });
  });

  it("caps active streams per tenant, ignoring stale ones", async () => {
    const running = (id: string, startedAt: string) =>
      conversationOf(id, { activeRunId: `run-${id}`, activeStreamStartedAt: startedAt });
    const recent = ["a", "b", "c", "d"].map((id) => running(id, "2026-09-30T11:59:00.000Z"));
    const { services } = setup([...recent, running("old", "2026-09-30T11:00:00.000Z")]);
    expect(await services.activeRuns.hasStreamCapacity(tenantId)).toBe(true);
    const full = setup([...recent, running("e", "2026-09-30T11:58:00.000Z")]);
    expect(await full.services.activeRuns.hasStreamCapacity(tenantId)).toBe(false);
  });
});
