import type { Conversation, UserId } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { callRoute } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import { ORG_A, ORG_B, setupChatRoutes } from "./chat-routes.fixture.ts";
import { buildConversationsRoutes } from "./conversations-route-handler.ts";

const setup = () => {
  const context = setupChatRoutes();
  const start = (ownerId: string, fields: Partial<Conversation> = {}) =>
    context.conversations
      .startConversation({ tenantId: ORG_A, projectId: null, ownerId: ownerId as UserId, agentId: "assistant" })
      .then(async (started) => {
        const next = { ...started, ...fields };
        await context.repository.save(next);
        return next;
      });
  const routes = buildConversationsRoutes(context.deps);
  return { ...context, routes, start };
};

const dataOf = async <T>(response: Response) =>
  (await response.json()) as { data: T; meta?: { page: { cursor: string | null; hasMore: boolean } } };

describe("/v1/conversations", () => {
  it("lists the caller's conversations pinned first with cursor pages, search and the archived filter", async () => {
    const { routes, start } = setup();
    const older = await start("alice", {
      lastMessageAt: "2026-09-30T08:00:00.000Z",
      title: "Plano de Ação",
      searchTokens: ["plano", "de", "acao"],
    });
    const newer = await start("alice", { lastMessageAt: "2026-09-30T09:00:00.000Z" });
    const pinned = await start("alice", { lastMessageAt: "2026-09-29T09:00:00.000Z", pinned: true });
    await start("alice", { archivedAt: "2026-09-30T10:00:00.000Z" });
    await start("carol");
    const first = await dataOf<Conversation[]>(
      await callRoute(routes, "conversations.list", `/v1/conversations?organizationId=${ORG_A}&limit=2`, {
        as: "alice",
      }),
    );
    expect(first.data.map((item) => item.id)).toEqual([pinned.id, newer.id]);
    const second = await dataOf<Conversation[]>(
      await callRoute(
        routes,
        "conversations.list",
        `/v1/conversations?organizationId=${ORG_A}&limit=2&cursor=${first.meta?.page.cursor ?? ""}`,
        { as: "alice" },
      ),
    );
    expect(second.data.map((item) => item.id)).toEqual([older.id]);
    const found = await dataOf<Conversation[]>(
      await callRoute(routes, "conversations.list", `/v1/conversations?organizationId=${ORG_A}&q=a%C3%A7%C3%A3o`, {
        as: "alice",
      }),
    );
    expect(found.data.map((item) => item.id)).toEqual([older.id]);
    const archived = await dataOf<Conversation[]>(
      await callRoute(routes, "conversations.list", `/v1/conversations?organizationId=${ORG_A}&archived=true`, {
        as: "alice",
      }),
    );
    expect(archived.data).toHaveLength(1);
  });

  it("answers 400 without an organization or over 50 per page, and 404 in an organization of others", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "conversations.list", "/v1/conversations", { as: "alice" })).status).toBe(400);
    expect(
      (
        await callRoute(routes, "conversations.list", `/v1/conversations?organizationId=${ORG_A}&limit=51`, {
          as: "alice",
        })
      ).status,
    ).toBe(400);
    expect(
      (await callRoute(routes, "conversations.list", `/v1/conversations?organizationId=${ORG_B}`, { as: "alice" }))
        .status,
    ).toBe(404);
  });

  it("reads, renames (titleSource user) and pins its own conversation; another member gets 404", async () => {
    const { routes, start } = setup();
    const conversation = await start("alice");
    const path = `/v1/conversations/${conversation.id}`;
    expect((await callRoute(routes, "conversations.get", path, { as: "carol" })).status).toBe(404);
    expect(
      (await callRoute(routes, "conversations.update", path, { method: "PATCH", as: "carol", body: { pinned: true } }))
        .status,
    ).toBe(404);
    const renamed = await callRoute(routes, "conversations.update", path, {
      method: "PATCH",
      as: "alice",
      body: { title: "Roadmap review", pinned: true },
    });
    expect(renamed.status).toBe(200);
    expect((await dataOf<Conversation>(renamed)).data).toMatchObject({
      title: "Roadmap review",
      titleSource: "user",
      pinned: true,
      searchTokens: ["roadmap", "review"],
    });
    expect(
      (await callRoute(routes, "conversations.update", path, { method: "PATCH", as: "alice", body: {} })).status,
    ).toBe(400);
  });

  it("deletes the memory thread, soft-deletes and audits; a failed thread delete answers 502", async () => {
    const { routes, start, chat, auditLog, repository } = setup();
    const conversation = await start("alice");
    const path = `/v1/conversations/${conversation.id}`;
    chat.script.deleteThread = { ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } };
    expect((await callRoute(routes, "conversations.delete", path, { method: "DELETE", as: "alice" })).status).toBe(502);
    expect((await repository.get(conversation.id))?.deletedAt).toBeNull();
    chat.script.deleteThread = { ok: false, error: { code: "NOT_FOUND", status: 404 } };
    expect((await callRoute(routes, "conversations.delete", path, { method: "DELETE", as: "alice" })).status).toBe(204);
    expect((await repository.get(conversation.id))?.deletedAt).not.toBeNull();
    expect(chat.calls.filter((call) => call.kind === "deleteThread").map((call) => call.scope.conversationId)).toEqual([
      conversation.id,
      conversation.id,
    ]);
    expect(auditLog.entries("tenant").filter((entry) => entry.action === "CONVERSATION_DELETED")).toMatchObject([
      { target: { type: "conversation", id: conversation.id }, actor: { id: "alice" } },
    ]);
    expect((await callRoute(routes, "conversations.get", path, { as: "alice" })).status).toBe(404);
  });

  it("refuses to delete a streaming conversation", async () => {
    const { routes, start } = setup();
    const conversation = await start("alice", {
      activeRunId: "run-1",
      activeStreamStartedAt: "2026-09-30T11:59:00.000Z",
    });
    expect(
      (
        await callRoute(routes, "conversations.delete", `/v1/conversations/${conversation.id}`, {
          method: "DELETE",
          as: "alice",
        })
      ).status,
    ).toBe(409);
  });

  it("lists messages validated as UI messages with a page cursor, and rejects a malformed upstream page", async () => {
    const { routes, start, chat } = setup();
    const conversation = await start("alice");
    chat.script.messages = [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] }];
    chat.script.hasMore = true;
    const listed = await dataOf<unknown[]>(
      await callRoute(routes, "conversations.listMessages", `/v1/conversations/${conversation.id}/messages?limit=10`, {
        as: "alice",
      }),
    );
    expect(listed.data).toEqual(chat.script.messages);
    expect(listed.meta?.page).toMatchObject({ cursor: "1", hasMore: true });
    chat.script.messages = [{ role: "user" }];
    expect(
      (
        await callRoute(routes, "conversations.listMessages", `/v1/conversations/${conversation.id}/messages`, {
          as: "alice",
        })
      ).status,
    ).toBe(502);
  });

  it("stores the summary and refreshes the search tokens", async () => {
    const { routes, start, chat } = setup();
    const conversation = await start("alice", { title: "Kickoff" });
    chat.script.summary = "Planejamento da integração";
    const summarized = await callRoute(
      routes,
      "conversations.summarize",
      `/v1/conversations/${conversation.id}/summary`,
      { method: "POST", as: "alice" },
    );
    expect(summarized.status).toBe(200);
    expect((await dataOf<Conversation>(summarized)).data).toMatchObject({
      summary: "Planejamento da integração",
      searchTokens: ["kickoff", "planejamento", "da", "integracao"],
    });
    chat.script.summaryResult = { ok: false, error: { code: "CONFLICT", status: 409 } };
    expect(
      (
        await callRoute(routes, "conversations.summarize", `/v1/conversations/${conversation.id}/summary`, {
          method: "POST",
          as: "alice",
        })
      ).status,
    ).toBe(409);
  });
});
