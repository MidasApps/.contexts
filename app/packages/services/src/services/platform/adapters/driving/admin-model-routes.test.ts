import type { ModelSettings, UpdateModelSettingsInput } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import type { OperationsGateway } from "../../application/ports/operations-gateway.ts";
import { createMastraOperationsGateway } from "../driven/mastra-operations-gateway.ts";
import { buildAdminOperationsRoutes } from "./admin-operations-route-handler.ts";

const NOW = "2026-10-05T12:00:00.000Z";
const URL = "/v1/admin/models";

const INPUT: UpdateModelSettingsInput = {
  roles: {
    chat: "openai/gpt-6-sol",
    fast: "openai/gpt-6-luna",
    reasoning: "openai/gpt-6-sol",
    judge: "openai/gpt-6-luna",
  },
  models: [{ modelId: "openai/gpt-6-luna", inputMicroUsdPerMTok: 100_000, outputMicroUsdPerMTok: 500_000 }],
};

const SETTINGS: ModelSettings = {
  aiMode: "real",
  roles: [{ role: "chat", modelId: "openai/gpt-6-sol", source: "staff", editable: true }],
  models: [
    {
      modelId: "openai/gpt-6-luna",
      inputMicroUsdPerMTok: 100_000,
      outputMicroUsdPerMTok: 500_000,
      source: "staff",
      available: true,
    },
  ],
  updatedAt: NOW,
};

const unused = (): never => {
  throw new Error("not used by the model routes");
};

const setup = (refuse = false) => {
  const { pipeline, auditLog } = makeInMemoryPipeline({
    now: NOW,
    members: [{ uid: "alice", tenantId: "OrgAaaaaaaaaaaaaaaaaa", role: "owner" }],
    staff: [
      { uid: "sam", role: "platform-admin", mfa: true },
      { uid: "sue", role: "platform-support", mfa: true },
      { uid: "nomfa", role: "platform-admin", mfa: false },
    ],
  });
  const calls: unknown[] = [];
  const operations: OperationsGateway = {
    listRuns: unused,
    cancelRun: unused,
    listSchedules: unused,
    actOnSchedule: unused,
    listAgents: unused,
    getPromptSeed: unused,
    getModelSettings: () => (calls.push(["get"]), Promise.resolve({ ok: true, data: SETTINGS })),
    updateModelSettings: ({ settings, actorId }) => {
      calls.push(["update", settings, actorId]);
      return Promise.resolve(
        refuse ? { ok: false, error: { code: "VALIDATION_FAILED", status: 400 } } : { ok: true, data: SETTINGS },
      );
    },
  };
  const routes = buildAdminOperationsRoutes({ pipeline, operations, listConnectors: unused });
  return { routes, calls, auditLog };
};

describe("/v1/admin/models", () => {
  it("answers the runtime's settings to staff with platform.model.manage only", async () => {
    const { routes, calls } = setup();
    const answer = await callRoute(routes, "admin.getModelSettings", URL, { as: "sam" });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ data: SETTINGS });
    for (const as of ["alice", "sue", "nomfa"])
      expect((await callRoute(routes, "admin.getModelSettings", URL, { as })).status).toBe(403);
    expect(calls).toEqual([["get"]]);
  });

  it("saves through the runtime with the staff user as actor and audits it on the platform log", async () => {
    const { routes, calls, auditLog } = setup();
    const answer = await callRoute(routes, "admin.updateModelSettings", URL, { method: "PUT", as: "sam", body: INPUT });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ data: SETTINGS });
    expect(calls).toEqual([["update", INPUT, "sam"]]);
    expect(auditLog.entries("platform").filter((entry) => entry.action === "MODEL_SETTINGS_UPDATED")).toMatchObject([
      { target: { type: "model-settings", id: "platform" }, outcome: "success" },
    ]);
  });

  it("refuses a body that is not the contract before the runtime is asked", async () => {
    const { routes, calls } = setup();
    const answer = await callRoute(routes, "admin.updateModelSettings", URL, {
      method: "PUT",
      as: "sam",
      body: { ...INPUT, roles: { ...INPUT.roles, chat: "gpt-6-sol" } },
    });
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(calls).toEqual([]);
  });

  it("answers 400 and audits nothing when the runtime refuses the settings", async () => {
    const { routes, auditLog } = setup(true);
    const answer = await callRoute(routes, "admin.updateModelSettings", URL, { method: "PUT", as: "sam", body: INPUT });
    expect(answer.status).toBe(400);
    expect(auditLog.entries("platform").filter((entry) => entry.action === "MODEL_SETTINGS_UPDATED")).toEqual([]);
  });

  it("sends the settings and the actor to the runtime's console route", async () => {
    const requests: { url: string; method: string | undefined; body: unknown }[] = [];
    const gateway = createMastraOperationsGateway({
      baseUrl: "http://runtime/",
      serverlessToken: null,
      fetch: (url, init) => {
        const body = typeof init?.body === "string" ? init.body : "null";
        requests.push({
          url: url instanceof Request ? url.url : url.toString(),
          method: init?.method,
          body: JSON.parse(body),
        });
        return Promise.resolve(Response.json({ data: SETTINGS }));
      },
    });
    expect(await gateway.updateModelSettings({ settings: INPUT, actorId: "sam", requestId: "r1" })).toEqual({
      ok: true,
      data: SETTINGS,
    });
    expect(requests).toEqual([
      { url: "http://runtime/console/models", method: "PUT", body: { settings: INPUT, actorId: "sam" } },
    ]);
  });
});
