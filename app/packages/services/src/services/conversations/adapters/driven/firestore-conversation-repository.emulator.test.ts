import { type Conversation, TenantIdSchema, type UserId } from "@core/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFirebaseAdmin } from "../../../shared/firebase/firebase-admin.ts";
import { decodeCursor } from "../../../shared/pagination/cursor.ts";
import { createConversation } from "../../domain/conversation.ts";
import { CONVERSATIONS_COLLECTION } from "./conversation-storage.ts";
import { createFirestoreConversationRepository } from "./firestore-conversation-repository.ts";

const { firestore } = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});
const repository = createFirestoreConversationRepository({ firestore });
// Tenants unique to this file: other suites share the emulator.
const TENANT = TenantIdSchema.parse("ConvRepoTenant000001");
const OTHER = TenantIdSchema.parse("ConvRepoTenant000002");
const OWNER = "conv-owner-1" as UserId;

const conversationOf = (fields: Partial<Conversation> = {}): Conversation => ({
  ...createConversation(
    { id: repository.newId(), tenantId: TENANT, projectId: null, ownerId: OWNER, agentId: "assistant" },
    new Date("2026-09-30T10:00:00.000Z"),
  ),
  ...fields,
});

const clear = async () => {
  for (const tenantId of [TENANT, OTHER]) {
    const docs = await firestore.collection(CONVERSATIONS_COLLECTION).where("tenantId", "==", tenantId).get();
    await Promise.all(docs.docs.map((doc) => doc.ref.delete()));
  }
};

beforeAll(clear);
afterAll(clear);

const page = (limit: number, cursor?: string | null) => ({
  after: cursor === undefined || cursor === null ? undefined : (decodeCursor(cursor) ?? undefined),
  limit,
});

describe("Firestore conversation repository", () => {
  it("stores and reads a conversation with its timestamps", async () => {
    const conversation = conversationOf({ archivedAt: "2026-09-30T11:00:00.000Z" });
    await repository.create(conversation);
    expect(await repository.get(conversation.id)).toEqual(conversation);
    const stored = (await firestore.collection(CONVERSATIONS_COLLECTION).doc(conversation.id).get()).data();
    expect(stored).toMatchObject({ archived: true, schemaVersion: 1 });
  });

  it("pages pinned first, then by last turn, and filters archived, deleted, other owners and tenants", async () => {
    await clear();
    const at = (hour: number) => `2026-09-30T${String(hour).padStart(2, "0")}:00:00.000Z`;
    const kept = [
      conversationOf({ lastMessageAt: at(1), pinned: true }),
      conversationOf({ lastMessageAt: at(5) }),
      conversationOf({ lastMessageAt: at(4) }),
      conversationOf({ lastMessageAt: at(3) }),
    ];
    const hidden = [
      conversationOf({ lastMessageAt: at(9), archivedAt: at(9) }),
      conversationOf({ lastMessageAt: at(9), deletedAt: at(9) }),
      conversationOf({ lastMessageAt: at(9), ownerId: "someone-else" as UserId }),
      conversationOf({ lastMessageAt: at(9), tenantId: OTHER }),
    ];
    for (const conversation of [...kept, ...hidden]) await repository.create(conversation);
    const first = await repository.list({ tenantId: TENANT, ownerId: OWNER, archived: false, page: page(3) });
    const second = await repository.list({
      tenantId: TENANT,
      ownerId: OWNER,
      archived: false,
      page: page(3, first.nextCursor),
    });
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(kept.map((item) => item.id));
    expect(second.nextCursor).toBeNull();
    const archived = await repository.list({ tenantId: TENANT, ownerId: OWNER, archived: true, page: page(10) });
    expect(archived.items.map((item) => item.id)).toEqual([hidden[0]?.id]);
    const pinned = await repository.list({
      tenantId: TENANT,
      ownerId: OWNER,
      archived: false,
      pinned: true,
      page: page(10),
    });
    expect(pinned.items.map((item) => item.id)).toEqual([kept[0]?.id]);
  });

  it("searches by any token", async () => {
    await clear();
    const match = conversationOf({ searchTokens: ["onboarding", "plan"] });
    await repository.create(match);
    await repository.create(conversationOf({ searchTokens: ["sales"] }));
    const found = await repository.list({
      tenantId: TENANT,
      ownerId: OWNER,
      archived: false,
      tokens: ["plan", "roadmap"],
      page: page(10),
    });
    expect(found.items.map((item) => item.id)).toEqual([match.id]);
  });

  it("starts and ends runs transactionally and counts active streams of the tenant", async () => {
    await clear();
    const conversation = conversationOf();
    await repository.create(conversation);
    await repository.startRun({
      conversationId: conversation.id,
      runId: "run-1",
      startedAt: "2026-09-30T12:00:00.000Z",
    });
    expect(await repository.countActiveRuns({ tenantId: TENANT, since: "2026-09-30T11:45:00.000Z" })).toBe(1);
    const ended = await repository.endRun({
      conversationId: conversation.id,
      runId: "run-1",
      endedAt: "2026-09-30T12:01:00.000Z",
      title: "Plan",
    });
    expect(ended).toMatchObject({
      activeRunId: null,
      title: "Plan",
      messageCount: 2,
      lastMessageAt: "2026-09-30T12:01:00.000Z",
    });
    expect(await repository.get(conversation.id)).toEqual(ended);
    expect(await repository.countActiveRuns({ tenantId: TENANT, since: "2026-09-30T11:45:00.000Z" })).toBe(0);
    expect(
      await repository.endRun({ conversationId: repository.newId(), runId: "x", endedAt: "2026-09-30T12:01:00.000Z" }),
    ).toBeNull();
  });
});
