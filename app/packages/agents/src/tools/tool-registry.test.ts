import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort } from "../testing/fake-ports.ts";
import { defineCoreTool } from "./define-core-tool.ts";
import { createToolRegistry, DuplicateToolError } from "./tool-registry.ts";

const readTool = defineCoreTool({
  id: "example.countNotes",
  description: "Counts notes. Use when the user asks how many notes exist.",
  kind: "read",
  permission: "example.note.read",
  inputSchema: z.strictObject({ max: z.int().min(1).describe("Upper bound.") }),
  outputSchema: z.strictObject({ count: z.int() }),
  execute: (input) => Promise.resolve({ count: input.max }),
});

const mutationTool = defineCoreTool({
  id: "command.example.ArchiveNoteCommand",
  description: "Archives a note. Use after the user confirmed which note.",
  kind: "mutation",
  permission: "example.note.archive",
  inputSchema: z.strictObject({ noteId: z.string().min(1).describe("Note id.") }),
  outputSchema: z.strictObject({ archived: z.boolean() }),
  execute: () => Promise.resolve({ archived: true }),
});

const createRegistry = () => {
  const access = createFakeAccessPort({
    memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: ["example.note.read", "example.note.archive"] }],
  });
  const registry = createToolRegistry({ access, audit: createFakeAuditPort(), approvals: createFakeApprovalPort() });
  registry.register(readTool);
  registry.register(mutationTool);
  return registry;
};

describe("createToolRegistry", () => {
  it("refuses a duplicate id and an unknown id at composition", () => {
    const registry = createRegistry();
    expect(() => registry.register(readTool)).toThrow(DuplicateToolError);
    expect(() => registry.toMastraTools(["example.missing"])).toThrow(/No tool is registered/);
    expect(registry.ids()).toEqual(["example.countNotes", "command.example.ArchiveNoteCommand"]);
  });

  it("builds Mastra tools keyed by id; mutations require approval, reads do not", () => {
    const tools = createRegistry().toMastraTools(["example.countNotes", "command.example.ArchiveNoteCommand"]);
    expect(tools["example.countNotes"]?.requireApproval).toBe(false);
    expect(tools["command.example.ArchiveNoteCommand"]?.requireApproval).toBe(true);
    expect(tools["example.countNotes"]?.strict).toBe(true);
  });

  it("runs the core pipeline through the Mastra tool with the request context", async () => {
    const tool = createRegistry().toMastraTools(["example.countNotes"])["example.countNotes"];
    const requestContext = new RequestContext<unknown>(buildAgentContextEntries({ permissions: ["example.note.read"] }));
    const result = await tool?.execute?.({ max: 4 }, { requestContext, agent: { agentId: "data", toolCallId: "call_1", messages: [], suspend: () => Promise.resolve() } } as never);
    expect(result).toEqual({ count: 4 });
  });

  it("does not run without the typed context", async () => {
    const tool = createRegistry().toMastraTools(["example.countNotes"])["example.countNotes"];
    await expect(tool?.execute?.({ max: 4 }, { requestContext: new RequestContext() } as never)).rejects.toMatchObject({ code: "CONTEXT_MISSING" });
  });
});
