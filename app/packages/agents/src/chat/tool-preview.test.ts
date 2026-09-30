import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MEMBER_PERMISSIONS } from "../agents/supervisor.fixture.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort, createFakeCommandIdempotency } from "../testing/fake-ports.ts";
import { defineCoreTool } from "../tools/define-core-tool.ts";
import { createToolRegistry } from "../tools/tool-registry.ts";
import { createChatStreamTap, createToolPreviewer } from "./tool-preview.ts";

const renameTool = defineCoreTool({
  id: "command.example.RenameThing",
  description: "Renames a thing, for tests only.",
  kind: "mutation",
  permission: "example.note.create",
  inputSchema: z.strictObject({ name: z.string().min(1).describe("New name.") }),
  outputSchema: z.strictObject({ ok: z.boolean() }),
  execute: () => Promise.resolve({ ok: true }),
  summarize: (input) => `Rename to ${input.name}`,
  preview: (input) => Promise.resolve({ before: { name: "Old" }, after: { name: input.name } }),
});

const setup = (permissions: readonly string[] = MEMBER_PERMISSIONS) => {
  const access = createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions }] });
  const deps = { access, audit: createFakeAuditPort(), approvals: createFakeApprovalPort(), commands: createFakeCommandIdempotency() };
  const registry = createToolRegistry(deps);
  registry.register(renameTool);
  const requestContext = new Map<string, unknown>(buildAgentContextEntries({ permissions }));
  return { previewer: createToolPreviewer({ tools: registry, toolDeps: deps }), requestContext };
};

const approvalChunk = (toolName: string, args: unknown): UIMessageChunk =>
  ({ type: "data-tool-call-approval", id: "call-1", data: { state: "data-tool-call-approval", runId: "run-1", toolCallId: "call-1", toolName, args } });

const pipe = async (chunks: UIMessageChunk[], tap: TransformStream<UIMessageChunk, UIMessageChunk>): Promise<UIMessageChunk[]> => {
  const source = new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const out: UIMessageChunk[] = [];
  for await (const chunk of source.pipeThrough(tap) as unknown as AsyncIterable<UIMessageChunk>) out.push(chunk);
  return out;
};

describe("createToolPreviewer", () => {
  it("describes a core tool by its sanitized stream name with summary, permission and before/after", async () => {
    const { previewer, requestContext } = setup();
    const preview = await previewer.describe({ toolName: "command_example_RenameThing", toolCallId: "call-1", args: { name: "New" }, requestContext });
    expect(preview).toEqual({
      toolCallId: "call-1",
      toolName: "command_example_RenameThing",
      toolId: "command.example.RenameThing",
      permission: "example.note.create",
      summary: "Rename to New",
      preview: { before: { name: "Old" }, after: { name: "New" } },
    });
  });

  it("omits before/after when the caller may not run the tool", async () => {
    const { previewer, requestContext } = setup(["core.chat.use"]);
    const preview = await previewer.describe({ toolName: "command_example_RenameThing", toolCallId: "call-1", args: { name: "New" }, requestContext });
    expect(preview).toMatchObject({ toolId: "command.example.RenameThing", preview: null });
  });

  it("describes an unknown tool (connector or MCP) by name only", async () => {
    const { previewer, requestContext } = setup();
    expect(await previewer.describe({ toolName: "mcp_tool", toolCallId: "call-9", args: {}, requestContext })).toEqual({ toolCallId: "call-9", toolName: "mcp_tool", preview: null });
  });

  it("never throws on invalid arguments", async () => {
    const { previewer, requestContext } = setup();
    const preview = await previewer.describe({ toolName: "command_example_RenameThing", toolCallId: "call-1", args: { name: 3 }, requestContext });
    expect(preview).toMatchObject({ toolId: "command.example.RenameThing", preview: null });
    expect(preview).not.toHaveProperty("summary");
  });
});

describe("createChatStreamTap", () => {
  it("passes chunks through and adds data-tool-preview right after data-tool-call-approval", async () => {
    const { previewer, requestContext } = setup();
    const states: string[] = [];
    const tap = createChatStreamTap({ previewer, requestContext, onState: (state) => states.push(state) });
    const out = await pipe(
      [{ type: "start" }, { type: "tool-approval-request", approvalId: "run-1::call-1", toolCallId: "call-1" }, approvalChunk("command_example_RenameThing", { name: "New" }), { type: "finish" }],
      tap,
    );
    expect(out.map((chunk) => chunk.type)).toEqual(["start", "tool-approval-request", "data-tool-call-approval", "data-tool-preview", "finish"]);
    expect(out[3]).toMatchObject({ type: "data-tool-preview", id: "call-1", data: { summary: "Rename to New", permission: "example.note.create" } });
    expect(states).toEqual(["suspended"]);
  });

  it("reports finished for a run that ends without a suspension", async () => {
    const { previewer, requestContext } = setup();
    const states: string[] = [];
    await pipe([{ type: "start" }, { type: "finish" }], createChatStreamTap({ previewer, requestContext, onState: (state) => states.push(state) }));
    expect(states).toEqual(["finished"]);
  });
});
