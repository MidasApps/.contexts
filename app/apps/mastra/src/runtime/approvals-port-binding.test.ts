import type { AgentApprovalRequest } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { ApprovalRefusedError, bindApprovalsPort } from "./approvals-port-binding.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const MEMBER = { type: "user", uid: "member-uid", mfa: false } as const;
const NODE = { level: "organization", tenantId: TENANT } as const;

const ACTION = {
  kind: "agent-command",
  tenantId: TENANT,
  requestedBy: "member-uid",
  agentId: "action",
  toolId: "command.tenancy.CreateProjectInput",
  commandId: "tenancy.CreateProjectInput",
  permission: "core.project.create",
  input: { name: "Launch" },
  runId: "run-1",
  toolCallId: "call-1",
  idempotencyKey: "run-1:call-1",
  summary: 'Create the project "Launch"',
  preview: null,
} as unknown as AgentApprovalRequest;

type RequestApproval = Parameters<typeof bindApprovalsPort>[0]["requestApproval"];

describe("bindApprovalsPort", () => {
  it("creates an SP1 approval request of kind agent-command and answers its id", async () => {
    const calls: Parameters<RequestApproval>[0][] = [];
    const port = bindApprovalsPort({
      requestApproval: (command) => {
        calls.push(command);
        return Promise.resolve({ ok: true, data: { id: "Ap1sK2lPq0WnR5tYu3bV" } } as never);
      },
    });
    const result = await port.requestApproval({ principal: MEMBER, node: NODE, permission: "core.project.create", action: ACTION, requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });
    expect(result).toEqual({ approvalId: "Ap1sK2lPq0WnR5tYu3bV" });
    expect(calls).toEqual([
      {
        principal: MEMBER,
        input: { node: NODE, permission: "core.project.create", action: { kind: "agent-command", input: ACTION, summary: 'Create the project "Launch"' } },
        requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      },
    ]);
  });

  it("rejects with the SP1 code when SP1 refuses (the tool answers APPROVAL_UNAVAILABLE)", async () => {
    const port = bindApprovalsPort({ requestApproval: () => Promise.resolve({ ok: false, error: { code: "APPROVAL_NOT_REQUIRED" } } as never) });
    const pending = port.requestApproval({ principal: MEMBER, node: NODE, permission: "core.project.create", action: ACTION, requestId: "r" });
    await expect(pending).rejects.toBeInstanceOf(ApprovalRefusedError);
    await expect(pending).rejects.toMatchObject({ code: "APPROVAL_NOT_REQUIRED" });
  });

  it("refuses a platform node before calling SP1", async () => {
    const port = bindApprovalsPort({ requestApproval: () => Promise.reject(new Error("must not run")) });
    await expect(port.requestApproval({ principal: MEMBER, node: { level: "platform" }, permission: "core.project.create", action: ACTION, requestId: "r" })).rejects.toThrow(/NODE/);
  });
});
