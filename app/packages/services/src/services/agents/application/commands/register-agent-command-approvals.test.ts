import { type Principal, TenantIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createApprovalHandlerRegistry } from "#/services/access/application/approval-handler-registry.ts";
import type { RequestAccess } from "#/services/access/composition.ts";
import { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { createInMemoryIdempotencyStore } from "#/services/shared/idempotency/in-memory-idempotency-store.ts";
import { err, ok } from "#/services/shared/result/result.ts";
import type { TenancyServices } from "#/services/tenancy/composition.ts";
import { agentCommandExecutors, DuplicateCommandError } from "./agent-command-executor.ts";
import { CREATE_PROJECT_COMMAND_ID, createCoreAgentCommandExecutors } from "./core-agent-command-executors.ts";
import { registerAgentCommandApprovals } from "./register-agent-command-approvals.ts";

const TENANT = TenantIdSchema.parse("Jd8sK2lPq0WnR5tYu3bV");
const PRINCIPAL = { type: "user", uid: "requester-uid", mfa: false } as unknown as Principal;
const clock = { now: () => new Date("2026-09-30T12:00:00.000Z") };
const access = {
  forRequest: (): RequestAccess => ({
    authorize: () => Promise.reject(new Error("unused")),
    getEffectivePermissions: () => Promise.reject(new Error("unused")),
  }),
};

const tenancyWith = (createProject: TenancyServices["createProject"]) => ({ createProject });

describe("createCoreAgentCommandExecutors", () => {
  it("runs tenancy.CreateProjectInput through SP1 createProject as the requester", async () => {
    const calls: unknown[] = [];
    const tenancy = tenancyWith((command) => {
      calls.push({
        actor: command.actor,
        tenantId: command.tenantId,
        input: command.input,
        requestId: command.requestId,
      });
      return Promise.resolve(ok({ id: "Pq8sK2lPq0WnR5tYu3bV", name: command.input.name } as never));
    });
    const [executor] = createCoreAgentCommandExecutors({ tenancy, access });
    expect(executor?.commandId).toBe(CREATE_PROJECT_COMMAND_ID);
    expect(executor?.permission).toBe("core.project.create");
    const run = executor?.prepare({ name: "Launch" });
    const output = await run?.({
      principal: PRINCIPAL,
      tenantId: TENANT,
      node: { level: "organization", tenantId: TENANT },
      requestId: "req-1",
      idempotencyKey: "run-1:call-1",
    });
    expect(output).toEqual({ projectId: "Pq8sK2lPq0WnR5tYu3bV", name: "Launch" });
    expect(calls).toEqual([{ actor: PRINCIPAL, tenantId: TENANT, input: { name: "Launch" }, requestId: "req-1" }]);
    expect(executor?.prepare({ name: "" })).toBeNull();
  });

  it("turns a refusal of the use case into COMMAND_REFUSED", async () => {
    const tenancy = tenancyWith(() => Promise.resolve(err(new AccessDeniedError("NOT_A_MEMBER"))));
    const [executor] = createCoreAgentCommandExecutors({ tenancy, access });
    const run = executor?.prepare({ name: "Launch" });
    await expect(
      run?.({
        principal: PRINCIPAL,
        tenantId: TENANT,
        node: { level: "organization", tenantId: TENANT },
        requestId: "req-1",
        idempotencyKey: "run-1:call-1",
      }),
    ).rejects.toMatchObject({ code: "COMMAND_REFUSED" });
  });
});

describe("agentCommandExecutors", () => {
  it("fails at boot when two commands share an id instead of letting one shadow the other", () => {
    const tenancy = tenancyWith(() => Promise.reject(new Error("unused")));
    const [executor] = createCoreAgentCommandExecutors({ tenancy, access });
    if (executor === undefined) throw new Error("no core command");
    expect(() => agentCommandExecutors([executor, executor])).toThrow(DuplicateCommandError);
    expect(agentCommandExecutors([executor]).get(CREATE_PROJECT_COMMAND_ID)).toBe(executor);
  });
});

describe("registerAgentCommandApprovals", () => {
  it("registers the agent-command handler once, even when composition runs again", () => {
    const handlers = createApprovalHandlerRegistry();
    const deps = {
      approvals: { handlers },
      executors: [],
      access,
      idempotency: createInMemoryIdempotencyStore({ clock }),
    };
    const first = registerAgentCommandApprovals(deps);
    const second = registerAgentCommandApprovals(deps);
    expect(handlers.kinds()).toEqual(["agent-command"]);
    expect(typeof first.runOnce).toBe("function");
    expect(typeof second.runOnce).toBe("function");
  });
});
