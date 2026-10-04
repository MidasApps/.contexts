import { describe, expect, it } from "vitest";
import { createFakePromptStorePort } from "../testing/fake-ports.ts";
import { handlePromptEval, type PromptEvalRouteDeps, type PromptEvalRunner } from "./prompt-eval-route.ts";

const PLATFORM_V = "01928f6e-7b2a-7c3d-9e4f-000000000001";
const ADDENDUM_V = "01928f6e-7b2a-7c3d-9e4f-000000000002";
const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const silent = { info: () => undefined, error: () => undefined };

const setup = (runner?: PromptEvalRunner) => {
  const prompts = createFakePromptStorePort({
    active: { assistant: { versionId: "active-platform", body: "Active platform." } },
    versions: [
      { versionId: PLATFORM_V, agentId: "assistant", scope: "platform", tenantId: null, body: "Candidate platform." },
      { versionId: ADDENDUM_V, agentId: "assistant", scope: "tenant", tenantId: TENANT, body: "Candidate addendum." },
    ],
  });
  const calls: Parameters<PromptEvalRunner>[0][] = [];
  const passing: PromptEvalRunner = (input) => {
    calls.push(input);
    return Promise.resolve({
      experimentId: "exp-1",
      verdict: "passed",
      scorers: [{ scorerId: "tool-routing", mean: 1, passed: true }],
    });
  };
  return { prompts, calls, deps: { prompts, runner: runner ?? passing, logger: silent } };
};

const call = (deps: PromptEvalRouteDeps, versionId: string, tenantId: string | null) =>
  handlePromptEval({ versionId, body: { tenantId }, requestId: "req", deps });

describe("POST /prompt-evals/:versionId (decision 0038)", () => {
  it("runs a platform candidate alone and records the verdict on the version", async () => {
    const { deps, calls, prompts } = setup();
    const response = await call(deps, PLATFORM_V, null);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { versionId: PLATFORM_V, experimentId: "exp-1", verdict: "passed" },
    });
    expect(calls).toEqual([
      { agentId: "assistant", platform: { versionId: PLATFORM_V, body: "Candidate platform." }, addendum: null },
    ]);
    expect(prompts.evals).toEqual([{ versionId: PLATFORM_V, experimentId: "exp-1", verdict: "passed" }]);
  });

  it("runs a tenant addendum on top of the active platform prompt", async () => {
    const { deps, calls } = setup();
    expect((await call(deps, ADDENDUM_V, TENANT)).status).toBe(200);
    expect(calls[0]).toEqual({
      agentId: "assistant",
      platform: { versionId: "active-platform", body: "Active platform." },
      addendum: { versionId: ADDENDUM_V, body: "Candidate addendum." },
    });
  });

  it("answers 404 for another tenant's addendum or an unknown version, 422 without an eval set, 503 without a runner", async () => {
    const { deps, prompts } = setup();
    expect((await call(deps, ADDENDUM_V, "OtherTenantaaaaaaaaa")).status).toBe(404);
    expect((await call(deps, ADDENDUM_V, null)).status).toBe(404);
    expect((await call(deps, "not-a-uuid", null)).status).toBe(404);
    expect((await call(setup(() => Promise.resolve("NO_DATASET")).deps, PLATFORM_V, null)).status).toBe(422);
    const noRunner: PromptEvalRouteDeps = { ...deps, runner: undefined };
    expect((await call(noRunner, PLATFORM_V, null)).status).toBe(503);
    expect(prompts.evals).toEqual([]);
  });
});
