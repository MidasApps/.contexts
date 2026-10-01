import type { ApprovalRequest } from "@core/contracts";
import { AgentCommandError, agentCommandExecutors, defineAgentCommandExecutor, type CommandIdempotency } from "@core/services";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApprovalRefusedError } from "./approvals-port-binding.ts";
import { bindWorkflowApprovalsPort, bindWorkflowCommandsPort } from "./workflow-ports-binding.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const MEMBER = { type: "user", uid: "member-uid", mfa: false } as const;
const NODE = { level: "organization", tenantId: TENANT } as const;
const ACTION = { workflowId: "approval-demo", runId: "run-1", stepId: "request-human-approval" };

type Approvals = Parameters<typeof bindWorkflowApprovalsPort>[0];

describe("bindWorkflowApprovalsPort", () => {
  it("creates an SP1 request of kind workflow-resume as the principal", async () => {
    const calls: Parameters<Approvals["requestApproval"]>[0][] = [];
    const port = bindWorkflowApprovalsPort({
      requestApproval: (command) => {
        calls.push(command);
        return Promise.resolve({ ok: true, data: { id: "Ap1sK2lPq0WnR5tYu3bV" } } as never);
      },
      getApprovalRequest: () => Promise.resolve(null),
    });
    const input = { principal: MEMBER, node: NODE, permission: "core.workflow-run.approve-demo", action: ACTION, summary: "Create the note", requestId: "r" };
    expect(await port.requestWorkflowApproval(input)).toEqual({ approvalId: "Ap1sK2lPq0WnR5tYu3bV" });
    expect(calls).toEqual([
      { principal: MEMBER, input: { node: NODE, permission: "core.workflow-run.approve-demo", action: { kind: "workflow-resume", input: ACTION, summary: "Create the note" } }, requestId: "r" },
    ]);
    await expect(port.requestWorkflowApproval({ ...input, node: { level: "platform" } })).rejects.toMatchObject({ code: "APPROVAL_NODE_INVALID" });
  });

  it("rejects with SP1's code when SP1 refuses", async () => {
    const port = bindWorkflowApprovalsPort({
      requestApproval: () => Promise.resolve({ ok: false, error: { code: "APPROVAL_NOT_REQUIRED" } } as never),
      getApprovalRequest: () => Promise.resolve(null),
    });
    const refused = port.requestWorkflowApproval({ principal: MEMBER, node: NODE, permission: "core.project.read", action: ACTION, summary: "s", requestId: "r" });
    await expect(refused).rejects.toBeInstanceOf(ApprovalRefusedError);
    await expect(refused).rejects.toMatchObject({ code: "APPROVAL_NOT_REQUIRED" });
  });

  it("maps the stored request to a record, and malformed or unknown ids to null", async () => {
    const stored = {
      id: "Ap1sK2lPq0WnR5tYu3bV",
      tenantId: TENANT,
      status: "approved",
      action: { kind: "workflow-resume", input: ACTION, summary: "s" },
      requestedBy: { type: "user", id: "member-uid" },
      decidedBy: "admin-uid",
      reason: null,
    } as unknown as ApprovalRequest;
    const port = bindWorkflowApprovalsPort({ requestApproval: () => Promise.reject(new Error("unused")), getApprovalRequest: (id) => Promise.resolve(id === stored.id ? stored : null) });
    expect(await port.getApprovalRequest({ approvalRequestId: stored.id })).toEqual({
      id: stored.id,
      tenantId: TENANT,
      status: "approved",
      kind: "workflow-resume",
      input: ACTION,
      requestedBy: { type: "user", id: "member-uid" },
      decidedBy: "admin-uid",
      reason: null,
    });
    expect(await port.getApprovalRequest({ approvalRequestId: "other" })).toBeNull();
    expect(await port.getApprovalRequest({ approvalRequestId: "" })).toBeNull();
  });
});

const NOTE = defineAgentCommandExecutor({
  commandId: "example.CreateNoteCommand",
  permission: "example.note.create",
  inputSchema: z.strictObject({ title: z.string().min(1) }),
  execute: ({ input }) => Promise.resolve({ id: `note-${input.title}` }),
});

const recordingIdempotency = (fail?: Error) => {
  const keys: string[] = [];
  const commands: CommandIdempotency = {
    runOnce: async ({ idempotencyKey, run }) => {
      keys.push(idempotencyKey);
      if (fail !== undefined) throw fail;
      return { output: await run(), replayed: false };
    },
  };
  return { commands, keys };
};

const accessAllowing = (allowed: boolean, requiresApproval = false) =>
  ({ forRequest: () => ({ authorize: () => Promise.resolve(allowed ? { allowed: true, requiresApproval } : { allowed: false, reason: "PERMISSION_NOT_GRANTED" }) }) }) as never;

const runWith = (args: { allowed?: boolean; requiresApproval?: boolean; commandId?: string; input?: unknown; fail?: Error; tenantId?: string }) => {
  const { commands, keys } = recordingIdempotency(args.fail);
  const port = bindWorkflowCommandsPort({ executors: agentCommandExecutors([NOTE]), access: accessAllowing(args.allowed ?? true, args.requiresApproval), commands });
  const result = port.run({
    principal: MEMBER,
    tenantId: args.tenantId ?? TENANT,
    node: NODE,
    commandId: args.commandId ?? "example.CreateNoteCommand",
    input: args.input ?? { title: "a" },
    idempotencyKey: "run-1",
    requestId: "r",
  });
  return { result, keys };
};

describe("bindWorkflowCommandsPort", () => {
  it("runs the executor once per workflow run key after SP1 re-authorizes the principal", async () => {
    const { result, keys } = runWith({});
    expect(await result).toEqual({ ok: true, output: { id: "note-a" }, replayed: false });
    expect(keys).toEqual(["workflow:run-1"]);
  });

  it("answers refusal codes instead of running", async () => {
    expect(await runWith({ commandId: "missing.Command" }).result).toEqual({ ok: false, code: "UNKNOWN_COMMAND" });
    expect(await runWith({ allowed: false }).result).toEqual({ ok: false, code: "REQUESTER_FORBIDDEN" });
    const fourEyes = runWith({ requiresApproval: true });
    expect(await fourEyes.result).toEqual({ ok: false, code: "APPROVAL_REQUIRED" });
    expect(fourEyes.keys).toEqual([]);
    expect(await runWith({ input: { title: "" } }).result).toEqual({ ok: false, code: "COMMAND_INPUT_INVALID" });
    expect(await runWith({ tenantId: "OtherTenant000000001" }).result).toEqual({ ok: false, code: "TENANT_MISMATCH" });
    expect(await runWith({ fail: new AgentCommandError("COMMAND_IN_PROGRESS", "example.CreateNoteCommand") }).result).toEqual({ ok: false, code: "COMMAND_IN_PROGRESS" });
  });

  it("rejects on infrastructure errors", async () => {
    await expect(runWith({ fail: new Error("firestore unavailable") }).result).rejects.toThrow("firestore unavailable");
  });
});
