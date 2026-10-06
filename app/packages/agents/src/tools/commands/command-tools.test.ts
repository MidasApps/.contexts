import { CreateProjectInputContract } from "@core/contracts";
import { AgentCommandError, defineContractCommand } from "@core/services";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildAgentContextEntries,
  TEST_REQUEST_ID,
  TEST_TENANT,
  TEST_UID,
} from "../../testing/agent-context-fixture.ts";
import {
  createFakeAccessPort,
  createFakeApprovalPort,
  createFakeAuditPort,
  createFakeCommandIdempotency,
} from "../../testing/fake-ports.ts";
import { runCoreTool } from "../core-tool-pipeline.ts";
import type { ToolCallInfo } from "../define-core-tool.ts";
import { CoreToolError } from "../tool-errors.ts";
import { commandToolOf, commandToolsOf } from "./command-tools.ts";

const PERMISSION = "core.project.create";

const registryCommand = (calls: unknown[] = [], refuse = false) =>
  defineContractCommand({
    contract: CreateProjectInputContract,
    targetContractId: "tenancy.Project",
    outputSchema: z.strictObject({ projectId: z.string() }),
    summarize: (input) => `Create the project "${input.name}"`,
    preview: (input) => ({ before: null, after: { name: input.name } }),
    execute: (call) => {
      calls.push(call);
      if (refuse) throw new AgentCommandError("COMMAND_REFUSED", CreateProjectInputContract.id);
      return Promise.resolve({ projectId: `project-${calls.length}` });
    },
  });

const setup = (approvalPermissions: string[] = []) => {
  const access = createFakeAccessPort({
    memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: ["core.chat.use", PERMISSION] }],
    approvalPermissions,
  });
  const audit = createFakeAuditPort();
  const approvals = createFakeApprovalPort();
  return { audit, approvals, deps: { access, audit, approvals, commands: createFakeCommandIdempotency() } };
};

const call = (toolCallId = "call_1"): ToolCallInfo => ({
  requestContext: new RequestContext<unknown>(buildAgentContextEntries({ permissions: ["core.chat.use", PERMISSION] })),
  agentId: "action",
  toolCallId,
});

describe("commandToolOf", () => {
  it("derives a mutation tool with the contract's id, schema and permission", () => {
    const { tool, targetContractId } = commandToolOf(registryCommand());
    expect(tool).toMatchObject({
      id: "command.tenancy.CreateProjectInput",
      kind: "mutation",
      permission: PERMISSION,
      commandId: "tenancy.CreateProjectInput",
    });
    expect(tool.inputSchema).toBe(CreateProjectInputContract.schema);
    expect(tool.description).toContain(CreateProjectInputContract.meta.description);
    expect(targetContractId).toBe("tenancy.Project");
  });

  it("runs the registry command with the server principal, tenant, node and idempotency key", async () => {
    const calls: unknown[] = [];
    const { deps, audit } = setup();
    const output = await runCoreTool(commandToolOf(registryCommand(calls)).tool, deps, { name: "Launch" }, call());
    expect(output).toEqual({ projectId: "project-1" });
    expect(calls).toEqual([
      {
        principal: { type: "user", uid: TEST_UID, mfa: false },
        tenantId: TEST_TENANT,
        node: { level: "organization", tenantId: TEST_TENANT },
        requestId: TEST_REQUEST_ID,
        idempotencyKey: `${TEST_REQUEST_ID}:call_1`,
        input: { name: "Launch" },
      },
    ]);
    expect(audit.entries[0]).toMatchObject({
      action: "AGENT_TOOL_EXECUTED",
      metadata: { toolId: "command.tenancy.CreateProjectInput", outcome: "succeeded" },
    });
  });

  it("returns the first result for a second call with the same key and runs the command once", async () => {
    const calls: unknown[] = [];
    const { deps } = setup();
    const { tool } = commandToolOf(registryCommand(calls));
    const first = await runCoreTool(tool, deps, { name: "Launch" }, call());
    const second = await runCoreTool(tool, deps, { name: "Launch" }, call());
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it("creates an approval request with the contract summary and preview when the permission needs four eyes", async () => {
    const calls: unknown[] = [];
    const { deps, approvals } = setup([PERMISSION]);
    const output = await runCoreTool(commandToolOf(registryCommand(calls)).tool, deps, { name: "Launch" }, call());
    expect(output).toEqual({ status: "pending-approval", approvalId: "approval-1" });
    expect(calls).toEqual([]);
    expect(approvals.requests[0]?.action).toMatchObject({
      commandId: "tenancy.CreateProjectInput",
      permission: PERMISSION,
      input: { name: "Launch" },
      idempotencyKey: `${TEST_REQUEST_ID}:call_1`,
      summary: 'Create the project "Launch"',
      preview: { before: null, after: { name: "Launch" } },
    });
  });

  it("reports the use case refusal with its stable code", async () => {
    const { deps } = setup();
    const run = runCoreTool(commandToolOf(registryCommand([], true)).tool, deps, { name: "Launch" }, call());
    await expect(run).rejects.toBeInstanceOf(CoreToolError);
    await expect(run).rejects.toMatchObject({ code: "COMMAND_REFUSED" });
  });

  it("refuses an input outside the contract before anything runs", async () => {
    const calls: unknown[] = [];
    const { deps } = setup();
    await expect(
      runCoreTool(commandToolOf(registryCommand(calls)).tool, deps, { name: "Launch", tenantId: "other" }, call()),
    ).rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
    expect(calls).toEqual([]);
  });

  it("keeps the registry order", () => {
    expect(commandToolsOf([registryCommand()]).map(({ tool }) => tool.id)).toEqual([
      "command.tenancy.CreateProjectInput",
    ]);
  });
});
