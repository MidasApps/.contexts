import { type AgentApprovalRequest, type ApprovalRequest, type Principal, TenantIdSchema, type UserPrincipal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { RequestAccess } from "../../../access/composition.ts";
import { createApprovalHandlerRegistry } from "../../../access/application/approval-handler-registry.ts";
import { createInMemoryIdempotencyStore } from "../../../shared/idempotency/in-memory-idempotency-store.ts";
import { AGENT_COMMAND_HANDLER_KIND, createAgentCommandApprovalHandler } from "./agent-command-approval-handler.ts";
import { agentCommandExecutors, defineAgentCommandExecutor } from "./agent-command-executor.ts";
import { createCommandIdempotency } from "./run-command-once.ts";

const TENANT = TenantIdSchema.parse("Jd8sK2lPq0WnR5tYu3bV");
const REQUESTER = { type: "user", uid: "requester-uid", mfa: false } as unknown as UserPrincipal;
const APPROVER = { type: "user", uid: "approver-uid", mfa: true } as unknown as UserPrincipal;
const clock = { now: () => new Date("2026-09-30T12:00:00.000Z") };

const ACTION: AgentApprovalRequest = {
  kind: "agent-command",
  tenantId: TENANT,
  requestedBy: REQUESTER.uid,
  agentId: "action",
  toolId: "command.sample.ArchiveNoteCommand",
  commandId: "sample.ArchiveNoteCommand",
  permission: "sample.note.archive",
  input: { noteId: "Xk2mQ9vLr3TnB7pWc1aZ" },
  runId: "run-1",
  toolCallId: "call-1",
  idempotencyKey: "run-1:call-1",
  summary: "Archive the note",
  preview: null,
} as unknown as AgentApprovalRequest;

const approvalRequest = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest =>
  ({
    id: "Ap1sK2lPq0WnR5tYu3bV",
    tenantId: TENANT,
    node: { level: "organization", tenantId: TENANT },
    permission: "sample.note.archive",
    requestedBy: { type: "user", uid: REQUESTER.uid },
    action: { kind: "agent-command", input: ACTION, summary: ACTION.summary },
    status: "approved",
    decidedBy: APPROVER.uid,
    reason: null,
    expiresAt: "2026-10-07T12:00:00.000Z",
    createdAt: "2026-09-30T11:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
    ...overrides,
  }) as unknown as ApprovalRequest;

const setup = (options: { allowed?: boolean } = {}) => {
  const runs: { principal: Principal; input: unknown }[] = [];
  const authorizeCalls: { principal: Principal; permission: string }[] = [];
  const access = {
    forRequest: (): RequestAccess => ({
      authorize: (request) => {
        authorizeCalls.push({ principal: request.principal, permission: request.permission });
        return Promise.resolve(options.allowed === false ? { allowed: false, reason: "NOT_A_MEMBER" as const } : { allowed: true as const, requiresApproval: true, grantedVia: [] });
      },
      getEffectivePermissions: () => Promise.reject(new Error("unused")),
    }),
  };
  const executor = defineAgentCommandExecutor({
    commandId: "sample.ArchiveNoteCommand",
    permission: "sample.note.archive",
    inputSchema: z.strictObject({ noteId: z.string().min(1) }),
    execute: ({ principal, input }) => {
      runs.push({ principal, input });
      return Promise.resolve({ archived: true });
    },
  });
  const handler = createAgentCommandApprovalHandler({
    executors: agentCommandExecutors([executor]),
    access,
    commands: createCommandIdempotency({ store: createInMemoryIdempotencyStore({ clock }) }),
  });
  const registry = createApprovalHandlerRegistry();
  registry.register(handler);
  const run = (input: unknown, context: { request?: ApprovalRequest; requester?: Principal | null } = {}) =>
    registry.get(AGENT_COMMAND_HANDLER_KIND)?.run(input, {
      request: context.request ?? approvalRequest(),
      requester: context.requester === undefined ? REQUESTER : context.requester,
      approver: APPROVER,
      requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    });
  return { runs, authorizeCalls, run, registry };
};

describe("createAgentCommandApprovalHandler", () => {
  it("registers the agent-command kind and validates the stored action with the contract", () => {
    const { registry } = setup();
    expect(registry.kinds()).toEqual(["agent-command"]);
    expect(registry.get("agent-command")?.check(ACTION)).toEqual([]);
    expect(registry.get("agent-command")?.check({ ...ACTION, idempotencyKey: "other" }).length).toBeGreaterThan(0);
  });

  it("re-authorizes the requester, then runs the command once with its input", async () => {
    const { runs, authorizeCalls, run } = setup();
    await run(ACTION);
    expect(authorizeCalls).toEqual([{ principal: REQUESTER, permission: "sample.note.archive" }]);
    expect(runs).toEqual([{ principal: REQUESTER, input: { noteId: "Xk2mQ9vLr3TnB7pWc1aZ" } }]);
  });

  it("never runs a key twice, even when an approval is replayed", async () => {
    const { runs, run } = setup();
    await run(ACTION);
    await run(ACTION);
    expect(runs).toHaveLength(1);
  });

  it("refuses without running when the requester lost the permission", async () => {
    const { runs, run } = setup({ allowed: false });
    await expect(run(ACTION)).rejects.toMatchObject({ code: "REQUESTER_FORBIDDEN" });
    expect(runs).toEqual([]);
  });

  it("refuses a requester that no longer resolves or is someone else", async () => {
    const { runs, run } = setup();
    await expect(run(ACTION, { requester: null })).rejects.toMatchObject({ code: "REQUESTER_UNAVAILABLE" });
    await expect(run(ACTION, { requester: APPROVER })).rejects.toMatchObject({ code: "REQUESTER_MISMATCH" });
    expect(runs).toEqual([]);
  });

  it("refuses an action whose tenant or permission differs from the approval request", async () => {
    const { runs, run } = setup();
    await expect(run(ACTION, { request: approvalRequest({ tenantId: TenantIdSchema.parse("Other00000000000000") }) })).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    await expect(run(ACTION, { request: approvalRequest({ permission: "sample.note.read" }) })).rejects.toMatchObject({ code: "PERMISSION_MISMATCH" });
    expect(runs).toEqual([]);
  });

  it("refuses an unknown command and an input the command schema rejects", async () => {
    const { runs, run } = setup();
    await expect(run({ ...ACTION, commandId: "sample.Missing", toolId: "command.sample.Missing" })).rejects.toMatchObject({ code: "UNKNOWN_COMMAND" });
    await expect(run({ ...ACTION, input: { noteId: "" } })).rejects.toMatchObject({ code: "COMMAND_INPUT_INVALID" });
    expect(runs).toEqual([]);
  });
});
