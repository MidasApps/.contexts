import { type TraceDetail, TenantIdSchema, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createInMemoryConsoleStores } from "../../../platform/adapters/driven/in-memory-console-stores.ts";
import { createConsoleServices } from "../../../platform/composition.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { createInMemoryConversationRepository } from "../../../conversations/adapters/driven/in-memory-conversation-repository.ts";
import { createInMemoryMessageFeedbackStore } from "../../../conversations/adapters/driven/firestore-message-feedback-store.ts";
import { buildFeedbackRoutes } from "../../../conversations/adapters/driving/feedback-route-handler.ts";
import { createConversationsServices } from "../../../conversations/composition.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { ConsoleGateway } from "../../application/ports/console-gateway.ts";
import { createObservabilityServices } from "../../composition.ts";
import { buildObservabilityRoutes } from "./traces-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";

/** The runtime's console routes: records every tenant filter it receives. */
const fakeConsole = () => {
  const calls: { op: string; tenantId: string | null; extra?: unknown }[] = [];
  const gateway: ConsoleGateway = {
    listTraces: (query) => (calls.push({ op: "listTraces", tenantId: query.tenantId, extra: { startedAfter: query.startedAfter, startedBefore: query.startedBefore } }), Promise.resolve({ ok: true, data: { traces: [], hasMore: false } })),
    getTrace: (query) => {
      calls.push({ op: "getTrace", tenantId: query.tenantId });
      return Promise.resolve(query.tenantId === ORG_B ? { ok: false, error: { code: "NOT_FOUND", status: 404 } } : { ok: true, data: { summary: {}, spans: [] } as unknown as TraceDetail });
    },
    listExperiments: (query) => (calls.push({ op: "listExperiments", tenantId: query.tenantId }), Promise.resolve({ ok: true, data: { experiments: [], hasMore: false } })),
    listDatasets: (query) => (calls.push({ op: "listDatasets", tenantId: query.tenantId }), Promise.resolve({ ok: true, data: [] })),
    startExperiment: (input) => (calls.push({ op: "startExperiment", tenantId: input.tenantId, extra: input }), Promise.resolve({ ok: true, data: { experimentId: "exp-1" } })),
    addFeedbackItem: (input) => (calls.push({ op: "addFeedbackItem", tenantId: input.tenantId, extra: input }), Promise.resolve({ ok: true, data: { datasetId: "ds", itemId: "it" } })),
  };
  return { gateway, calls };
};

const setup = async () => {
  const { pipeline, auditLog, clock } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
    staff: [{ uid: "sam", role: "platform-admin", mfa: true }],
  });
  const { gateway, calls } = fakeConsole();
  const memory = createInMemoryConsoleStores({ organizations: [{ id: ORG_A }, { id: ORG_B }] });
  const settings = createConsoleServices({ ...memory.stores, audit: makeRecordAudit({ writer: auditLog, clock }), clock });
  const conversations = createConversationsServices({ conversations: createInMemoryConversationRepository(), clock });
  const started = await conversations.startConversation({ tenantId: TenantIdSchema.parse(ORG_A), ownerId: UserIdSchema.parse("mia"), projectId: null, agentId: "assistant" });
  const conversationId = started.id;
  const feedback = createInMemoryMessageFeedbackStore();
  const observability = createObservabilityServices({
    console: gateway,
    getAgentSettings: settings.getAgentSettings,
    getConversation: conversations.getConversation,
    feedback: feedback.store,
    clock,
    logger: { warn: () => undefined },
  });
  return { routes: { ...buildObservabilityRoutes({ pipeline, observability }), ...buildFeedbackRoutes({ pipeline, observability }) }, calls, feedback, conversationId };
};

describe("/v1/traces and /v1/admin/traces", () => {
  it("always filters a tenant endpoint by the caller's organization, and refuses another one", async () => {
    const { routes, calls } = await setup();
    expect((await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_A}`, { as: "alice" })).status).toBe(200);
    expect((await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_B}`, { as: "alice" })).status).toBe(404);
    expect((await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_A}`, { as: "mia" })).status).toBe(403);
    expect((await callRoute(routes, "traces.get", `/v1/traces/${TRACE}?organizationId=${ORG_B}`, { as: "bob" })).status).toBe(404);
    expect(calls.map((call) => [call.op, call.tenantId])).toEqual([
      ["listTraces", ORG_A],
      ["getTrace", ORG_B],
    ]);
  });

  it("lets staff read every tenant or one, and refuses tenant admins", async () => {
    const { routes, calls } = await setup();
    expect((await callRoute(routes, "traces.adminList", "/v1/admin/traces", { as: "sam" })).status).toBe(200);
    expect((await callRoute(routes, "traces.adminList", `/v1/admin/traces?organizationId=${ORG_B}`, { as: "sam" })).status).toBe(200);
    expect((await callRoute(routes, "traces.adminGet", `/v1/admin/traces/${TRACE}`, { as: "alice" })).status).toBe(403);
    expect(calls.map((call) => call.tenantId)).toEqual([null, ORG_B]);
  });
});

describe("trace time range", () => {
  const AFTER = "2026-09-29T03:00:00.000Z";
  const BEFORE = "2026-10-01T03:00:00.000Z";

  it("passes the range to the runtime for staff and for a tenant", async () => {
    const { routes, calls } = await setup();
    expect((await callRoute(routes, "traces.adminList", `/v1/admin/traces?startedAfter=${AFTER}&startedBefore=${BEFORE}`, { as: "sam" })).status).toBe(200);
    expect((await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_A}&startedAfter=${AFTER}`, { as: "alice" })).status).toBe(200);
    expect(calls.map((call) => [call.tenantId, call.extra])).toEqual([
      [null, { startedAfter: AFTER, startedBefore: BEFORE }],
      [ORG_A, { startedAfter: AFTER, startedBefore: undefined }],
    ]);
  });

  it("refuses an inverted or empty range and a value that is not an instant, without calling the runtime", async () => {
    const { routes, calls } = await setup();
    const inverted = await callRoute(routes, "traces.adminList", `/v1/admin/traces?startedAfter=${BEFORE}&startedBefore=${AFTER}`, { as: "sam" });
    expect(inverted.status).toBe(400);
    expect(await inverted.json()).toMatchObject({ error: { code: "VALIDATION_FAILED", details: [{ field: "startedBefore", issue: "NOT_AFTER_START" }] } });
    expect((await callRoute(routes, "traces.adminList", `/v1/admin/traces?startedAfter=${AFTER}&startedBefore=${AFTER}`, { as: "sam" })).status).toBe(400);
    expect((await callRoute(routes, "traces.adminList", "/v1/admin/traces?startedAfter=yesterday", { as: "sam" })).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("/v1/evals", () => {
  it("starts an experiment only for an agent the organization enabled, as the caller", async () => {
    const { routes, calls } = await setup();
    const disabled = await callRoute(routes, "evals.startExperiment", `/v1/evals/experiments?organizationId=${ORG_A}`, { method: "POST", as: "alice", body: { datasetId: "ds", agentId: "web" } });
    expect(disabled.status).toBe(400);
    expect(await disabled.json()).toMatchObject({ error: { details: [{ field: "agentId", issue: "AGENT_NOT_ENABLED" }] } });
    const started = await callRoute(routes, "evals.startExperiment", `/v1/evals/experiments?organizationId=${ORG_A}`, { method: "POST", as: "alice", body: { datasetId: "ds", agentId: "knowledge" } });
    expect(started.status).toBe(202);
    expect(calls.at(-1)).toMatchObject({ op: "startExperiment", tenantId: ORG_A, extra: { userId: "alice", agentId: "knowledge" } });
  });
});

describe("POST /v1/conversations/{id}/feedback", () => {
  it("keeps one rating per message and user, and sends a thumbs-down to the feedback dataset on request", async () => {
    const { routes, calls, feedback, conversationId } = await setup();
    const path = `/v1/conversations/${conversationId}/feedback`;
    expect((await callRoute(routes, "conversations.recordFeedback", path, { method: "POST", as: "mia", body: { messageId: "m1", rating: "up" } })).status).toBe(200);
    const again = await callRoute(routes, "conversations.recordFeedback", path, { method: "POST", as: "mia", body: { messageId: "m1", rating: "down", comment: "Wrong document.", addToDataset: true } });
    expect(await again.json()).toMatchObject({ data: { rating: "down", comment: "Wrong document.", tenantId: ORG_A, createdAt: "2026-10-01T12:00:00.000Z" } });
    expect(feedback.rows.size).toBe(1);
    expect(calls.map((call) => [call.op, call.tenantId, (call.extra as { messageId?: string; rating?: string }).messageId, (call.extra as { rating?: string }).rating])).toEqual([["addFeedbackItem", ORG_A, "m1", "down"]]);
    expect((await callRoute(routes, "conversations.recordFeedback", path, { method: "POST", as: "alice", body: { messageId: "m1", rating: "up" } })).status).toBe(404);
    expect((await callRoute(routes, "conversations.recordFeedback", path, { method: "POST", as: "mia", body: { messageId: "m1", rating: "up", comment: "x".repeat(1001) } })).status).toBe(400);
  });
});
