import { type EvalExperimentSummary, TenantIdSchema, type TraceDetail, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { makeRecordAudit } from "#/services/audit/application/use-cases/record-audit.ts";
import { createInMemoryMessageFeedbackStore } from "#/services/conversations/adapters/driven/firestore-message-feedback-store.ts";
import { createInMemoryConversationRepository } from "#/services/conversations/adapters/driven/in-memory-conversation-repository.ts";
import { buildFeedbackRoutes } from "#/services/conversations/adapters/driving/feedback-route-handler.ts";
import { createConversationsServices } from "#/services/conversations/composition.ts";
import { createInMemoryConsoleStores } from "#/services/platform/adapters/driven/in-memory-console-stores.ts";
import { createConsoleServices } from "#/services/platform/composition.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
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
    listTraces: (query) => (
      calls.push({
        op: "listTraces",
        tenantId: query.tenantId,
        extra: { startedAfter: query.startedAfter, startedBefore: query.startedBefore },
      }),
      Promise.resolve({ ok: true, data: { traces: [], hasMore: false } })
    ),
    getTrace: (query) => {
      calls.push({ op: "getTrace", tenantId: query.tenantId });
      return Promise.resolve(
        query.tenantId === ORG_B
          ? { ok: false, error: { code: "NOT_FOUND", status: 404 } }
          : { ok: true, data: { summary: {}, spans: [] } as unknown as TraceDetail },
      );
    },
    listExperiments: (query) => (
      calls.push({ op: "listExperiments", tenantId: query.tenantId }),
      Promise.resolve({ ok: true, data: { experiments: [], hasMore: false } })
    ),
    getExperiment: (query) => {
      calls.push({ op: "getExperiment", tenantId: query.tenantId, extra: query.experimentId });
      return Promise.resolve(
        query.experimentId === "missing"
          ? { ok: false, error: { code: "NOT_FOUND", status: 404 } }
          : { ok: true, data: { experimentId: query.experimentId } as unknown as EvalExperimentSummary },
      );
    },
    listDatasets: (query) => (
      calls.push({ op: "listDatasets", tenantId: query.tenantId }), Promise.resolve({ ok: true, data: [] })
    ),
    startExperiment: (input) => (
      calls.push({ op: "startExperiment", tenantId: input.tenantId, extra: input }),
      Promise.resolve({ ok: true, data: { experimentId: "exp-1" } })
    ),
    listDatasetItems: (query) => (
      calls.push({ op: "listDatasetItems", tenantId: query.tenantId, extra: query.datasetId }),
      Promise.resolve({ ok: true, data: { items: [], hasMore: false } })
    ),
    addDatasetItem: (input) => {
      calls.push({ op: "addDatasetItem", tenantId: input.tenantId, extra: input });
      return Promise.resolve({
        ok: true,
        data: {
          id: "item-1",
          datasetId: input.datasetId,
          input: input.input,
          expectedOutput: input.expectedOutput ?? null,
          createdAt: "2026-10-01T12:00:00.000Z",
        },
      });
    },
    deleteDatasetItem: (input) => {
      calls.push({ op: "deleteDatasetItem", tenantId: input.tenantId, extra: input.itemId });
      return Promise.resolve(
        input.itemId === "missing"
          ? { ok: false, error: { code: "NOT_FOUND", status: 404 } }
          : { ok: true, data: { itemId: input.itemId } },
      );
    },
    createDataset: (input) => {
      calls.push({ op: "createDataset", tenantId: input.tenantId, extra: input.name });
      if (input.name === "taken") return Promise.resolve({ ok: false, error: { code: "CONFLICT", status: 409 } });
      return Promise.resolve({
        ok: true,
        data: {
          id: "ds-new",
          name: input.name,
          tenantId: TenantIdSchema.parse(input.tenantId),
          version: 0,
          targetIds: ["assistant"],
          createdAt: "2026-10-01T12:00:00.000Z",
        },
      });
    },
    renameDataset: (input) => {
      calls.push({ op: "renameDataset", tenantId: input.tenantId, extra: input.name });
      if (input.datasetId === "feedback")
        return Promise.resolve({ ok: false, error: { code: "DATASET_RESERVED", status: 422 } });
      return Promise.resolve({
        ok: true,
        data: {
          id: input.datasetId,
          name: input.name,
          tenantId: TenantIdSchema.parse(input.tenantId),
          version: 0,
          targetIds: ["assistant"],
          createdAt: "2026-10-01T12:00:00.000Z",
        },
      });
    },
    deleteDataset: (input) => {
      calls.push({ op: "deleteDataset", tenantId: input.tenantId, extra: input.datasetId });
      return Promise.resolve(
        input.datasetId === "used"
          ? { ok: false, error: { code: "DATASET_IN_USE", status: 409 } }
          : { ok: true, data: { datasetId: input.datasetId } },
      );
    },
    addFeedbackItem: (input) => (
      calls.push({ op: "addFeedbackItem", tenantId: input.tenantId, extra: input }),
      Promise.resolve({ ok: true, data: { datasetId: "ds", itemId: "it" } })
    ),
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
  const settings = createConsoleServices({
    ...memory.stores,
    audit: makeRecordAudit({ writer: auditLog, clock }),
    clock,
  });
  const conversations = createConversationsServices({ conversations: createInMemoryConversationRepository(), clock });
  const started = await conversations.startConversation({
    tenantId: TenantIdSchema.parse(ORG_A),
    ownerId: UserIdSchema.parse("mia"),
    projectId: null,
    agentId: "assistant",
  });
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
  return {
    routes: {
      ...buildObservabilityRoutes({ pipeline, observability }),
      ...buildFeedbackRoutes({ pipeline, observability }),
    },
    calls,
    feedback,
    conversationId,
  };
};

describe("/v1/traces and /v1/admin/traces", () => {
  it("always filters a tenant endpoint by the caller's organization, and refuses another one", async () => {
    const { routes, calls } = await setup();
    expect((await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_A}`, { as: "alice" })).status).toBe(
      200,
    );
    expect((await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_B}`, { as: "alice" })).status).toBe(
      404,
    );
    expect((await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_A}`, { as: "mia" })).status).toBe(
      403,
    );
    expect(
      (await callRoute(routes, "traces.get", `/v1/traces/${TRACE}?organizationId=${ORG_B}`, { as: "bob" })).status,
    ).toBe(404);
    expect(calls.map((call) => [call.op, call.tenantId])).toEqual([
      ["listTraces", ORG_A],
      ["getTrace", ORG_B],
    ]);
  });

  it("lets staff read every tenant or one, and refuses tenant admins", async () => {
    const { routes, calls } = await setup();
    expect((await callRoute(routes, "traces.adminList", "/v1/admin/traces", { as: "sam" })).status).toBe(200);
    expect(
      (await callRoute(routes, "traces.adminList", `/v1/admin/traces?organizationId=${ORG_B}`, { as: "sam" })).status,
    ).toBe(200);
    expect((await callRoute(routes, "traces.adminGet", `/v1/admin/traces/${TRACE}`, { as: "alice" })).status).toBe(403);
    expect(calls.map((call) => call.tenantId)).toEqual([null, ORG_B]);
  });
});

describe("trace time range", () => {
  const AFTER = "2026-09-29T03:00:00.000Z";
  const BEFORE = "2026-10-01T03:00:00.000Z";

  it("passes the range to the runtime for staff and for a tenant", async () => {
    const { routes, calls } = await setup();
    expect(
      (
        await callRoute(routes, "traces.adminList", `/v1/admin/traces?startedAfter=${AFTER}&startedBefore=${BEFORE}`, {
          as: "sam",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await callRoute(routes, "traces.list", `/v1/traces?organizationId=${ORG_A}&startedAfter=${AFTER}`, {
          as: "alice",
        })
      ).status,
    ).toBe(200);
    expect(calls.map((call) => [call.tenantId, call.extra])).toEqual([
      [null, { startedAfter: AFTER, startedBefore: BEFORE }],
      [ORG_A, { startedAfter: AFTER, startedBefore: undefined }],
    ]);
  });

  it("refuses an inverted or empty range and a value that is not an instant, without calling the runtime", async () => {
    const { routes, calls } = await setup();
    const inverted = await callRoute(
      routes,
      "traces.adminList",
      `/v1/admin/traces?startedAfter=${BEFORE}&startedBefore=${AFTER}`,
      { as: "sam" },
    );
    expect(inverted.status).toBe(400);
    expect(await inverted.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", details: [{ field: "startedBefore", issue: "NOT_AFTER_START" }] },
    });
    expect(
      (
        await callRoute(routes, "traces.adminList", `/v1/admin/traces?startedAfter=${AFTER}&startedBefore=${AFTER}`, {
          as: "sam",
        })
      ).status,
    ).toBe(400);
    expect(
      (await callRoute(routes, "traces.adminList", "/v1/admin/traces?startedAfter=yesterday", { as: "sam" })).status,
    ).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("one experiment by id", () => {
  it("reads a tenant's experiment under the caller's organization only", async () => {
    const { routes, calls } = await setup();
    const own = await callRoute(routes, "evals.getExperiment", `/v1/evals/experiments/exp-1?organizationId=${ORG_A}`, {
      as: "alice",
    });
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ data: { experimentId: "exp-1" } });
    expect(
      (
        await callRoute(routes, "evals.getExperiment", `/v1/evals/experiments/exp-1?organizationId=${ORG_B}`, {
          as: "alice",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await callRoute(routes, "evals.getExperiment", `/v1/evals/experiments/missing?organizationId=${ORG_A}`, {
          as: "alice",
        })
      ).status,
    ).toBe(404);
    expect(calls.map((call) => [call.op, call.tenantId, call.extra])).toEqual([
      ["getExperiment", ORG_A, "exp-1"],
      ["getExperiment", ORG_A, "missing"],
    ]);
  });

  it("lets staff read any experiment and refuses a tenant admin", async () => {
    const { routes, calls } = await setup();
    expect(
      (await callRoute(routes, "evals.adminGetExperiment", "/v1/admin/experiments/exp-9", { as: "sam" })).status,
    ).toBe(200);
    expect(
      (await callRoute(routes, "evals.adminGetExperiment", "/v1/admin/experiments/exp-9", { as: "alice" })).status,
    ).toBe(403);
    expect(calls.map((call) => [call.op, call.tenantId])).toEqual([["getExperiment", null]]);
  });
});

describe("/v1/evals", () => {
  it("starts an experiment only for an agent the organization enabled, as the caller", async () => {
    const { routes, calls } = await setup();
    const disabled = await callRoute(routes, "evals.startExperiment", `/v1/evals/experiments?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body: { datasetId: "ds", agentId: "web" },
    });
    expect(disabled.status).toBe(400);
    expect(await disabled.json()).toMatchObject({
      error: { details: [{ field: "agentId", issue: "AGENT_NOT_ENABLED" }] },
    });
    const started = await callRoute(routes, "evals.startExperiment", `/v1/evals/experiments?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body: { datasetId: "ds", agentId: "knowledge" },
    });
    expect(started.status).toBe(202);
    expect(calls.at(-1)).toMatchObject({
      op: "startExperiment",
      tenantId: ORG_A,
      extra: { userId: "alice", agentId: "knowledge" },
    });
  });
});

describe("/v1/evals dataset items (follow-up 66)", () => {
  it("lists a dataset's items under the caller's organization only, and refuses a member without core.eval.read", async () => {
    const { routes, calls } = await setup();
    const own = await callRoute(
      routes,
      "evals.listDatasetItems",
      `/v1/evals/datasets/ds-1/items?organizationId=${ORG_A}&page=1&perPage=10`,
      { as: "alice" },
    );
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ data: [], meta: { hasMore: false } });
    expect(
      (
        await callRoute(routes, "evals.listDatasetItems", `/v1/evals/datasets/ds-1/items?organizationId=${ORG_B}`, {
          as: "alice",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await callRoute(routes, "evals.listDatasetItems", `/v1/evals/datasets/ds-1/items?organizationId=${ORG_A}`, {
          as: "mia",
        })
      ).status,
    ).toBe(403);
    expect(calls.map((call) => [call.op, call.tenantId, call.extra])).toEqual([["listDatasetItems", ORG_A, "ds-1"]]);
  });

  it("adds a manual item with the organization of the call, never one the body names", async () => {
    const { routes, calls } = await setup();
    const added = await callRoute(
      routes,
      "evals.addDatasetItem",
      `/v1/evals/datasets/ds-1/items?organizationId=${ORG_A}`,
      { method: "POST", as: "alice", body: { input: " Refund policy? ", expectedOutput: "30 days." } },
    );
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({
      data: { id: "item-1", input: "Refund policy?", expectedOutput: "30 days." },
    });
    const smuggled = await callRoute(
      routes,
      "evals.addDatasetItem",
      `/v1/evals/datasets/ds-1/items?organizationId=${ORG_A}`,
      { method: "POST", as: "alice", body: { input: "x", tenantId: ORG_B } },
    );
    expect(smuggled.status).toBe(400);
    expect(
      (
        await callRoute(routes, "evals.addDatasetItem", `/v1/evals/datasets/ds-1/items?organizationId=${ORG_A}`, {
          method: "POST",
          as: "alice",
          body: { input: "  " },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await callRoute(routes, "evals.addDatasetItem", `/v1/evals/datasets/ds-1/items?organizationId=${ORG_A}`, {
          method: "POST",
          as: "mia",
          body: { input: "x" },
        })
      ).status,
    ).toBe(403);
    expect(calls).toEqual([
      {
        op: "addDatasetItem",
        tenantId: ORG_A,
        extra: { tenantId: ORG_A, datasetId: "ds-1", input: "Refund policy?", expectedOutput: "30 days." },
      },
    ]);
  });

  it("deletes an item with 204 and answers 404 for one the runtime does not find", async () => {
    const { routes, calls } = await setup();
    const deleted = await callRoute(
      routes,
      "evals.deleteDatasetItem",
      `/v1/evals/datasets/ds-1/items/item-1?organizationId=${ORG_A}`,
      { method: "DELETE", as: "alice" },
    );
    expect(deleted.status).toBe(204);
    expect(
      (
        await callRoute(
          routes,
          "evals.deleteDatasetItem",
          `/v1/evals/datasets/ds-1/items/missing?organizationId=${ORG_A}`,
          { method: "DELETE", as: "alice" },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await callRoute(
          routes,
          "evals.deleteDatasetItem",
          `/v1/evals/datasets/ds-1/items/item-1?organizationId=${ORG_B}`,
          { method: "DELETE", as: "alice" },
        )
      ).status,
    ).toBe(404);
    expect(calls.map((call) => [call.op, call.tenantId, call.extra])).toEqual([
      ["deleteDatasetItem", ORG_A, "item-1"],
      ["deleteDatasetItem", ORG_A, "missing"],
    ]);
  });

  it("creates a dataset of the organization and answers 409 for a name it already uses", async () => {
    const { routes, calls } = await setup();
    const created = await callRoute(routes, "evals.createDataset", `/v1/evals/datasets?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body: { name: "refunds" },
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ data: { id: "ds-new", tenantId: ORG_A } });
    const taken = await callRoute(routes, "evals.createDataset", `/v1/evals/datasets?organizationId=${ORG_A}`, {
      method: "POST",
      as: "alice",
      body: { name: "taken" },
    });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: { code: "CONFLICT" } });
    expect(
      (
        await callRoute(routes, "evals.createDataset", `/v1/evals/datasets?organizationId=${ORG_A}`, {
          method: "POST",
          as: "mia",
          body: { name: "x" },
        })
      ).status,
    ).toBe(403);
    expect(calls.map((call) => [call.op, call.tenantId, call.extra])).toEqual([
      ["createDataset", ORG_A, "refunds"],
      ["createDataset", ORG_A, "taken"],
    ]);
  });
});

describe("POST /v1/conversations/{id}/feedback", () => {
  it("keeps one rating per message and user, and sends a thumbs-down to the feedback dataset on request", async () => {
    const { routes, calls, feedback, conversationId } = await setup();
    const path = `/v1/conversations/${conversationId}/feedback`;
    expect(
      (
        await callRoute(routes, "conversations.recordFeedback", path, {
          method: "POST",
          as: "mia",
          body: { messageId: "m1", rating: "up" },
        })
      ).status,
    ).toBe(200);
    const again = await callRoute(routes, "conversations.recordFeedback", path, {
      method: "POST",
      as: "mia",
      body: { messageId: "m1", rating: "down", comment: "Wrong document.", addToDataset: true },
    });
    expect(await again.json()).toMatchObject({
      data: { rating: "down", comment: "Wrong document.", tenantId: ORG_A, createdAt: "2026-10-01T12:00:00.000Z" },
    });
    expect(feedback.rows.size).toBe(1);
    expect(
      calls.map((call) => [
        call.op,
        call.tenantId,
        (call.extra as { messageId?: string; rating?: string }).messageId,
        (call.extra as { rating?: string }).rating,
      ]),
    ).toEqual([["addFeedbackItem", ORG_A, "m1", "down"]]);
    expect(
      (
        await callRoute(routes, "conversations.recordFeedback", path, {
          method: "POST",
          as: "alice",
          body: { messageId: "m1", rating: "up" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await callRoute(routes, "conversations.recordFeedback", path, {
          method: "POST",
          as: "mia",
          body: { messageId: "m1", rating: "up", comment: "x".repeat(1001) },
        })
      ).status,
    ).toBe(400);
  });

  it("renames and deletes a dataset of the organization, passing the runtime's refusals on", async () => {
    const { routes, calls } = await setup();
    const path = (datasetId: string) => `/v1/evals/datasets/${datasetId}?organizationId=${ORG_A}`;
    const renamed = await callRoute(routes, "evals.renameDataset", path("ds-1"), {
      method: "PATCH",
      as: "alice",
      body: { name: "returns" },
    });
    expect(await renamed.json()).toMatchObject({ data: { id: "ds-1", name: "returns" } });
    const reserved = await callRoute(routes, "evals.renameDataset", path("feedback"), {
      method: "PATCH",
      as: "alice",
      body: { name: "x" },
    });
    expect(reserved.status).toBe(422);
    expect(
      (await callRoute(routes, "evals.deleteDataset", path("ds-1"), { method: "DELETE", as: "alice" })).status,
    ).toBe(204);
    const used = await callRoute(routes, "evals.deleteDataset", path("used"), { method: "DELETE", as: "alice" });
    expect(await used.json()).toMatchObject({ error: { code: "DATASET_IN_USE" } });
    expect((await callRoute(routes, "evals.deleteDataset", path("ds-1"), { method: "DELETE", as: "mia" })).status).toBe(
      403,
    );
    expect(calls.map((call) => [call.op, call.tenantId, call.extra])).toEqual([
      ["renameDataset", ORG_A, "returns"],
      ["renameDataset", ORG_A, "x"],
      ["deleteDataset", ORG_A, "ds-1"],
      ["deleteDataset", ORG_A, "used"],
    ]);
  });
});
