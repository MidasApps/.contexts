import { PromptVersionIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { PromptEvalGateway } from "../../application/ports/prompt-eval-gateway.ts";
import { createPromptServices } from "../../prompt-composition.ts";
import { createInMemoryPromptRepository } from "../driven/in-memory-prompt-repository.ts";
import { buildPromptRoutes } from "./prompts-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";

type Version = { id: string; version: number; evalVerdict: string | null; scope: string; tenantId: string | null };

const setup = (verdict: "passed" | "failed" = "passed") => {
  const { pipeline, auditLog, clock } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
    staff: [{ uid: "sam", role: "platform-admin", mfa: true }],
  });
  const memory = createInMemoryPromptRepository();
  // Like the runtime route: runs the eval and records the verdict on the version.
  const evals: PromptEvalGateway = {
    evaluate: async ({ versionId, tenantId }) => {
      await memory.repository.recordEval({ versionId, tenantId, experimentId: `exp-${versionId.slice(-4)}`, verdict });
      return {
        ok: true,
        data: {
          versionId: PromptVersionIdSchema.parse(versionId),
          experimentId: `exp-${versionId.slice(-4)}`,
          verdict,
          scorers: [{ scorerId: "tool-routing", mean: verdict === "passed" ? 1 : 0, passed: verdict === "passed" }],
        },
      };
    },
  };
  const prompts = createPromptServices({
    prompts: memory.repository,
    evals,
    audit: makeRecordAudit({ writer: auditLog, clock }),
  });
  return { routes: buildPromptRoutes({ pipeline, prompts }), memory, auditLog };
};

const json = async <T>(response: Response) => (await response.json()) as T;
const ADMIN = "/v1/admin/agents/assistant";
const ADDENDUM_PATH = "/v1/agents/assistant/prompt-addendum";

describe("platform prompts (/v1/admin/agents/{id})", () => {
  it("writes a new version on every write, never updating one", async () => {
    const { routes, memory, auditLog } = setup();
    for (const body of ["First.", "Second."]) {
      expect(
        (
          await callRoute(routes, "prompts.adminCreateVersion", `${ADMIN}/prompt-versions`, {
            method: "POST",
            as: "sam",
            body: { body },
          })
        ).status,
      ).toBe(201);
    }
    const listed = await json<{ data: Version[] }>(
      await callRoute(routes, "prompts.adminListVersions", `${ADMIN}/prompt-versions`, { as: "sam" }),
    );
    expect(listed.data.map((version) => [version.version, version.scope, version.tenantId])).toEqual([
      [2, "platform", null],
      [1, "platform", null],
    ]);
    expect(memory.versions.map((version) => version.body)).toEqual(["Second.", "First."]);
    expect(auditLog.entries("platform").map((entry) => entry.action)).toEqual([
      "PROMPT_VERSION_CREATED",
      "PROMPT_VERSION_CREATED",
    ]);
    expect(
      (await callRoute(routes, "prompts.adminListVersions", `${ADMIN}/prompt-versions`, { as: "alice" })).status,
    ).toBe(403);
  });

  it("refuses activation without a passing eval (409 EVAL_REQUIRED) and activates once it passed", async () => {
    const { routes } = setup();
    const version = (
      await json<{ data: Version }>(
        await callRoute(routes, "prompts.adminCreateVersion", `${ADMIN}/prompt-versions`, {
          method: "POST",
          as: "sam",
          body: { body: "V1." },
        }),
      )
    ).data;
    const refused = await callRoute(routes, "prompts.adminActivate", `${ADMIN}/activations`, {
      method: "POST",
      as: "sam",
      body: { versionId: version.id },
    });
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({ error: { code: "EVAL_REQUIRED" } });
    const evaluated = await callRoute(
      routes,
      "prompts.adminEvaluateVersion",
      `${ADMIN}/prompt-versions/${version.id}/eval`,
      { method: "POST", as: "sam" },
    );
    expect(await json(evaluated)).toMatchObject({ data: { verdict: "passed" } });
    expect(
      (
        await callRoute(routes, "prompts.adminActivate", `${ADMIN}/activations`, {
          method: "POST",
          as: "sam",
          body: { versionId: version.id },
        })
      ).status,
    ).toBe(201);
  });

  it("lets staff force with a reason (audited PROMPT_ACTIVATION_FORCED) and rolls back with a new activation row", async () => {
    const { routes, memory, auditLog } = setup("failed");
    const v1 = (
      await json<{ data: Version }>(
        await callRoute(routes, "prompts.adminCreateVersion", `${ADMIN}/prompt-versions`, {
          method: "POST",
          as: "sam",
          body: { body: "V1." },
        }),
      )
    ).data;
    const v2 = (
      await json<{ data: Version }>(
        await callRoute(routes, "prompts.adminCreateVersion", `${ADMIN}/prompt-versions`, {
          method: "POST",
          as: "sam",
          body: { body: "V2." },
        }),
      )
    ).data;
    await callRoute(routes, "prompts.adminEvaluateVersion", `${ADMIN}/prompt-versions/${v2.id}/eval`, {
      method: "POST",
      as: "sam",
    });
    expect(
      (
        await callRoute(routes, "prompts.adminActivate", `${ADMIN}/activations`, {
          method: "POST",
          as: "sam",
          body: { versionId: v2.id },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await callRoute(routes, "prompts.adminActivate", `${ADMIN}/activations`, {
          method: "POST",
          as: "sam",
          body: { versionId: v2.id, force: true },
        })
      ).status,
    ).toBe(400);
    const forced = { versionId: v2.id, force: true, reason: "Dataset under rebuild." };
    expect(
      (
        await callRoute(routes, "prompts.adminActivate", `${ADMIN}/activations`, {
          method: "POST",
          as: "sam",
          body: forced,
        })
      ).status,
    ).toBe(201);
    const rollback = { versionId: v1.id, force: true, reason: "Roll back to V1." };
    expect(
      (
        await callRoute(routes, "prompts.adminActivate", `${ADMIN}/activations`, {
          method: "POST",
          as: "sam",
          body: rollback,
        })
      ).status,
    ).toBe(201);
    expect(memory.activations.map((activation) => activation.versionId)).toEqual([v1.id, v2.id]);
    expect((await memory.repository.getActive({ agentId: "assistant", tenantId: null })).platform?.body).toBe("V1.");
    expect(auditLog.entries("platform").filter((entry) => entry.action === "PROMPT_ACTIVATION_FORCED")).toEqual([
      expect.objectContaining({ reason: "Dataset under rebuild." }),
      expect.objectContaining({ reason: "Roll back to V1." }),
    ]);
  });
});

describe("tenant addenda (/v1/agents/{id}/prompt-addendum)", () => {
  it("writes addenda of the caller's organization only, never platform text, and never forced", async () => {
    const { routes, memory, auditLog } = setup();
    const created = await callRoute(
      routes,
      "prompts.createAddendumVersion",
      `${ADDENDUM_PATH}/versions?organizationId=${ORG_A}`,
      { method: "POST", as: "alice", body: { body: "Cite documents." } },
    );
    const version = (await json<{ data: Version }>(created)).data;
    expect(version).toMatchObject({ scope: "tenant", tenantId: ORG_A, version: 1 });
    expect(auditLog.entries("tenant")).toEqual([
      expect.objectContaining({ action: "PROMPT_VERSION_CREATED", tenantId: ORG_A }),
    ]);
    expect(
      (
        await callRoute(routes, "prompts.createAddendumVersion", `${ADDENDUM_PATH}/versions?organizationId=${ORG_A}`, {
          method: "POST",
          as: "mia",
          body: { body: "x" },
        })
      ).status,
    ).toBe(403);
    const forced = await callRoute(
      routes,
      "prompts.activateAddendum",
      `${ADDENDUM_PATH}/activations?organizationId=${ORG_A}`,
      { method: "POST", as: "alice", body: { versionId: version.id, force: true, reason: "x" } },
    );
    expect(forced.status).toBe(403);
    const foreign = await callRoute(
      routes,
      "prompts.evaluateAddendumVersion",
      `${ADDENDUM_PATH}/versions/${version.id}/eval?organizationId=${ORG_B}`,
      { method: "POST", as: "bob" },
    );
    expect(foreign.status).toBe(404);
    await callRoute(
      routes,
      "prompts.evaluateAddendumVersion",
      `${ADDENDUM_PATH}/versions/${version.id}/eval?organizationId=${ORG_A}`,
      { method: "POST", as: "alice" },
    );
    expect(
      (
        await callRoute(routes, "prompts.activateAddendum", `${ADDENDUM_PATH}/activations?organizationId=${ORG_A}`, {
          method: "POST",
          as: "alice",
          body: { versionId: version.id },
        })
      ).status,
    ).toBe(201);
    expect(await memory.repository.getActive({ agentId: "assistant", tenantId: ORG_A })).toMatchObject({
      platform: null,
      addendum: { body: "Cite documents." },
    });
    expect((await memory.repository.getActive({ agentId: "assistant", tenantId: ORG_B })).addendum).toBeNull();
  });

  it("cannot activate a platform version as the organization's addendum", async () => {
    const { routes } = setup();
    const platform = (
      await json<{ data: Version }>(
        await callRoute(routes, "prompts.adminCreateVersion", `${ADMIN}/prompt-versions`, {
          method: "POST",
          as: "sam",
          body: { body: "P." },
        }),
      )
    ).data;
    const response = await callRoute(
      routes,
      "prompts.activateAddendum",
      `${ADDENDUM_PATH}/activations?organizationId=${ORG_A}`,
      { method: "POST", as: "alice", body: { versionId: platform.id } },
    );
    expect(response.status).toBe(404);
  });
});
