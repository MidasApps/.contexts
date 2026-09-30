import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApprovalPort, AuditPort } from "../runtime/runtime-ports.ts";
import { buildAgentContextEntries, TEST_REQUEST_ID, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort, createFakeCommandIdempotency } from "../testing/fake-ports.ts";
import { runCoreTool } from "./core-tool-pipeline.ts";
import { type CoreToolContext, type CoreToolDeps, defineCoreTool, hashToolInput, type ToolCallInfo } from "./define-core-tool.ts";
import { CoreToolError } from "./tool-errors.ts";

const NOTE_OUTPUT = z.strictObject({ noteId: z.string() });

const createNote = defineCoreTool({
  id: "command.example.CreateNoteCommand",
  description: "Creates a note. Use when the user confirmed the note text.",
  kind: "mutation",
  permission: "example.note.create",
  inputSchema: z.strictObject({ text: z.string().min(1).describe("Note text.") }),
  outputSchema: NOTE_OUTPUT,
  summarize: (input) => `Create a note (${input.text.length} chars)`,
  preview: (input) => Promise.resolve({ before: null, after: { text: input.text } }),
  execute: (input) => Promise.resolve({ noteId: `note-${input.text.length}` }),
});

const listNotes = defineCoreTool({
  id: "example.listNotes",
  description: "Lists notes. Use when the user asks which notes exist.",
  kind: "read",
  permission: "example.note.read",
  inputSchema: z.strictObject({ limit: z.int().min(1).max(50).describe("Maximum notes.") }),
  outputSchema: z.strictObject({ count: z.int() }),
  execute: (input) => Promise.resolve({ count: input.limit }),
});

const PERMISSIONS = ["core.chat.use", "example.note.read", "example.note.create", "example.note.archive"];

const setup = (overrides: Partial<CoreToolDeps> = {}, approvalPermissions: string[] = []) => {
  const access = createFakeAccessPort({
    memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: PERMISSIONS }],
    approvalPermissions,
  });
  const audit = createFakeAuditPort();
  const approvals = createFakeApprovalPort();
  const deps: CoreToolDeps = { access, audit, approvals, ...overrides };
  return { access, audit, approvals, deps };
};

const call = (overrides: { permissions?: string[]; requestContext?: RequestContext; abortSignal?: AbortSignal } = {}): ToolCallInfo => ({
  requestContext: overrides.requestContext ?? new RequestContext<unknown>(buildAgentContextEntries({ permissions: overrides.permissions ?? PERMISSIONS })),
  agentId: "action",
  toolCallId: "call_7",
  ...(overrides.abortSignal === undefined ? {} : { abortSignal: overrides.abortSignal }),
});

const rejection = async (promise: Promise<unknown>): Promise<CoreToolError> => {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof CoreToolError) return error;
    throw error;
  }
  throw new Error("expected a CoreToolError");
};

describe("defineCoreTool", () => {
  it("refuses a non-strict input schema at definition time", () => {
    expect(() =>
      defineCoreTool({ ...listNotes, inputSchema: z.object({ limit: z.int().describe("x") }) }),
    ).toThrow(/strict/);
  });

  it("refuses an undocumented input field and a malformed permission", () => {
    expect(() => defineCoreTool({ ...listNotes, inputSchema: z.strictObject({ limit: z.int() }) })).toThrow(/describe/);
    expect(() => defineCoreTool({ ...listNotes, permission: "notes" })).toThrow(/permission/);
  });
});

describe("runCoreTool", () => {
  it("runs a read tool the principal may use", async () => {
    const { deps, audit } = setup();
    await expect(runCoreTool(listNotes, deps, { limit: 3 }, call())).resolves.toEqual({ count: 3 });
    expect(audit.entries).toEqual([]);
  });

  it("rejects an input key the strict schema does not declare, without executing", async () => {
    const execute = vi.fn((input: { limit: number }, ctx: CoreToolContext) => listNotes.execute(input, ctx));
    const { deps } = setup();
    const error = await rejection(runCoreTool({ ...listNotes, execute }, deps, { limit: 3, tenantId: "x" }, call()));
    expect(error.code).toBe("TOOL_INPUT_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed with CONTEXT_MISSING when a context key is absent", async () => {
    const execute = vi.fn((input: { limit: number }, ctx: CoreToolContext) => listNotes.execute(input, ctx));
    const { deps, access } = setup();
    const entries = buildAgentContextEntries().filter(([key]) => key !== "tenantId");
    const error = await rejection(runCoreTool({ ...listNotes, execute }, deps, { limit: 1 }, call({ requestContext: new RequestContext<unknown>(entries) })));
    expect(error.code).toBe("CONTEXT_MISSING");
    expect(error.details).toMatchObject({ missing: ["tenantId"] });
    expect(execute).not.toHaveBeenCalled();
    expect(access.verifyCalls).toEqual([]);
  });

  it("returns FORBIDDEN when authorize denies, without executing", async () => {
    const execute = vi.fn((input: { limit: number }, ctx: CoreToolContext) => listNotes.execute(input, ctx));
    const access = createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: ["core.chat.use"] }] });
    const { deps } = setup({ access });
    const error = await rejection(runCoreTool({ ...listNotes, execute }, deps, { limit: 1 }, call()));
    expect(error.code).toBe("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses the effective context permissions as the ceiling", async () => {
    const authorize = vi.fn(setup().access.authorize);
    const { deps } = setup({ access: { ...setup().access, authorize } });
    const error = await rejection(runCoreTool(listNotes, deps, { limit: 1 }, call({ permissions: ["core.chat.use"] })));
    expect(error.code).toBe("FORBIDDEN");
    expect(authorize.mock.calls[0]?.[0].ceiling).toEqual(new Set(["core.chat.use"]));
  });

  it("narrows the ceiling further with the calling agent's ceiling", async () => {
    const { deps } = setup({ agentCeilings: { action: new Set(["example.note.create"]) } });
    const error = await rejection(runCoreTool(listNotes, deps, { limit: 1 }, call()));
    expect(error.code).toBe("FORBIDDEN");
  });

  it("fails closed when authorize itself fails", async () => {
    const base = setup();
    const { deps } = setup({ access: { ...base.access, authorize: () => Promise.reject(new Error("firestore down: secret-detail")) } });
    const error = await rejection(runCoreTool(listNotes, deps, { limit: 1 }, call()));
    expect(error.code).toBe("AUTHORIZATION_UNAVAILABLE");
    expect(error.message).not.toMatch(/secret-detail/);
  });

  it("executes a mutation and audits it with an input hash, never the raw input", async () => {
    const { deps, audit } = setup();
    await expect(runCoreTool(createNote, deps, { text: "private words" }, call())).resolves.toEqual({ noteId: "note-13" });
    expect(audit.entries).toHaveLength(1);
    const [entry] = audit.entries;
    expect(entry).toMatchObject({
      action: "AGENT_TOOL_EXECUTED",
      tenantId: TEST_TENANT,
      requestId: TEST_REQUEST_ID,
      metadata: {
        toolId: "command.example.CreateNoteCommand",
        permission: "example.note.create",
        agentId: "action",
        outcome: "succeeded",
        inputHash: hashToolInput({ text: "private words" }),
      },
    });
    expect(JSON.stringify(entry)).not.toContain("private words");
  });

  it("creates an approval request instead of executing when SP1 requires approval", async () => {
    const execute = vi.fn((input: { text: string }, ctx: CoreToolContext) => createNote.execute(input, ctx));
    const { deps, approvals, audit } = setup({}, ["example.note.create"]);
    const result = await runCoreTool({ ...createNote, execute }, deps, { text: "hello" }, call());
    expect(result).toEqual({ status: "pending-approval", approvalId: "approval-1" });
    expect(execute).not.toHaveBeenCalled();
    expect(approvals.requests).toHaveLength(1);
    expect(approvals.requests[0]).toMatchObject({
      requestId: TEST_REQUEST_ID,
      permission: "example.note.create",
      node: { level: "organization", tenantId: TEST_TENANT },
      action: {
        kind: "agent-command",
        tenantId: TEST_TENANT,
        requestedBy: TEST_UID,
        agentId: "action",
        toolId: "command.example.CreateNoteCommand",
        commandId: "example.CreateNoteCommand",
        input: { text: "hello" },
        runId: TEST_REQUEST_ID,
        toolCallId: "call_7",
        idempotencyKey: `${TEST_REQUEST_ID}:call_7`,
        summary: "Create a note (5 chars)",
        preview: { before: null, after: { text: "hello" } },
      },
    });
    expect(audit.entries[0]?.metadata).toMatchObject({ outcome: "pending-approval", approvalId: "approval-1" });
  });

  it("fails closed with APPROVAL_UNAVAILABLE when the approval port fails", async () => {
    const execute = vi.fn((input: { text: string }, ctx: CoreToolContext) => createNote.execute(input, ctx));
    const approvals: ApprovalPort = { requestApproval: () => Promise.reject(new Error("no handler")) };
    const { deps } = setup({ approvals }, ["example.note.create"]);
    const error = await rejection(runCoreTool({ ...createNote, execute }, deps, { text: "hello" }, call()));
    expect(error.code).toBe("APPROVAL_UNAVAILABLE");
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports AUDIT_UNAVAILABLE with the outcome when the audit write fails", async () => {
    const audit: AuditPort = { record: () => Promise.reject(new Error("audit down")) };
    const { deps } = setup({ audit });
    const error = await rejection(runCoreTool(createNote, deps, { text: "hello" }, call()));
    expect(error.code).toBe("AUDIT_UNAVAILABLE");
    expect(error.details).toMatchObject({ outcome: "succeeded" });
  });

  it("hands execute an idempotency key derived from runId:toolCallId", async () => {
    const keys: string[] = [];
    const recording = defineCoreTool({ ...createNote, execute: (input, ctx) => (keys.push(ctx.idempotencyKey), createNote.execute(input, ctx)) });
    const { deps } = setup();
    await runCoreTool(recording, deps, { text: "x" }, call());
    expect(keys).toEqual([`${TEST_REQUEST_ID}:call_7`]);
  });

  describe("command idempotency (follow-up #26)", () => {
    it("runs a mutation once per runId:toolCallId and replays its stored result", async () => {
      const execute = vi.fn((input: { text: string }, ctx: CoreToolContext) => createNote.execute(input, ctx));
      const commands = createFakeCommandIdempotency();
      const { deps, audit } = setup({ commands });
      const first = await runCoreTool({ ...createNote, execute }, deps, { text: "hello" }, call());
      const second = await runCoreTool({ ...createNote, execute }, deps, { text: "hello" }, call());
      expect(first).toEqual({ noteId: "note-5" });
      expect(second).toEqual({ noteId: "note-5" });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(commands.runs).toEqual([{ tenantId: TEST_TENANT, commandId: "example.CreateNoteCommand", idempotencyKey: `${TEST_REQUEST_ID}:call_7`, input: { text: "hello" } }]);
      expect(audit.entries.map((entry) => entry.metadata.replayed)).toEqual([false, true]);
    });

    it("never routes read tools through the store", async () => {
      const commands = createFakeCommandIdempotency();
      const { deps } = setup({ commands });
      await runCoreTool(listNotes, deps, { limit: 1 }, call());
      expect(commands.runs).toEqual([]);
    });

    it("keeps the store refusal code and fails closed when the store is down", async () => {
      const inProgress = { runOnce: () => Promise.reject(Object.assign(new Error("busy"), { code: "COMMAND_IN_PROGRESS" })) };
      expect((await rejection(runCoreTool(createNote, setup({ commands: inProgress }).deps, { text: "x" }, call()))).code).toBe("COMMAND_IN_PROGRESS");
      const down = { runOnce: () => Promise.reject(new Error("firestore unavailable")) };
      expect((await rejection(runCoreTool(createNote, setup({ commands: down }).deps, { text: "x" }, call()))).code).toBe("IDEMPOTENCY_UNAVAILABLE");
    });
  });

  it("stops a tool that exceeds its timeout with TOOL_TIMEOUT", async () => {
    const timeout = new AbortController();
    const hanging = defineCoreTool({ ...listNotes, execute: () => new Promise<never>(() => undefined) });
    const { deps } = setup({ timeoutSignal: () => timeout.signal });
    const running = runCoreTool(hanging, deps, { limit: 1 }, call());
    timeout.abort(new DOMException("timed out", "TimeoutError"));
    expect((await rejection(running)).code).toBe("TOOL_TIMEOUT");
  });

  it("gives read tools 15 s and mutations 30 s by default", async () => {
    const seen: number[] = [];
    const { deps } = setup({ timeoutSignal: (ms) => (seen.push(ms), new AbortController().signal) });
    await runCoreTool(listNotes, deps, { limit: 1 }, call());
    await runCoreTool(createNote, deps, { text: "x" }, call());
    expect(seen).toEqual([15_000, 30_000]);
  });

  it("propagates the run's abort signal to execute and reports TOOL_ABORTED", async () => {
    const run = new AbortController();
    let received: AbortSignal | undefined;
    const waiting = defineCoreTool({
      ...listNotes,
      execute: (_input, ctx) => {
        received = ctx.abortSignal;
        return new Promise<never>(() => undefined);
      },
    });
    const { deps } = setup();
    const running = runCoreTool(waiting, deps, { limit: 1 }, call({ abortSignal: run.signal }));
    run.abort();
    expect((await rejection(running)).code).toBe("TOOL_ABORTED");
    expect(received?.aborted).toBe(true);
  });

  it("rejects an output that violates the output schema", async () => {
    const broken = defineCoreTool({ ...listNotes, execute: () => Promise.resolve({ count: "three" } as never) });
    const { deps } = setup();
    expect((await rejection(runCoreTool(broken, deps, { limit: 1 }, call()))).code).toBe("TOOL_OUTPUT_INVALID");
  });

  it("maps an unexpected execute error to TOOL_FAILED without its message and audits the failure", async () => {
    const failing = defineCoreTool({ ...createNote, execute: () => Promise.reject(new Error("SQL: select * from secrets")) });
    const { deps, audit } = setup();
    const error = await rejection(runCoreTool(failing, deps, { text: "x" }, call()));
    expect(error.code).toBe("TOOL_FAILED");
    expect(error.message).not.toMatch(/secrets/);
    expect(audit.entries[0]?.metadata).toMatchObject({ outcome: "failed", errorCode: "TOOL_FAILED" });
  });

  it("keeps a typed failure thrown by execute", async () => {
    const failing = defineCoreTool({
      ...listNotes,
      execute: () => Promise.reject(new CoreToolError({ code: "NOTE_NOT_FOUND", toolId: "example.listNotes", message: "Note not found." })),
    });
    const { deps } = setup();
    expect((await rejection(runCoreTool(failing, deps, { limit: 1 }, call()))).code).toBe("NOTE_NOT_FOUND");
  });

  it("audits a denied mutation", async () => {
    const { deps, audit } = setup();
    await rejection(runCoreTool(createNote, deps, { text: "x" }, call({ permissions: ["core.chat.use"] })));
    expect(audit.entries[0]?.metadata).toMatchObject({ outcome: "denied", errorCode: "FORBIDDEN" });
  });

  it("audits a read tool that opts in (for example SQL queries)", async () => {
    const audited = defineCoreTool({ ...listNotes, audit: { action: "SEMANTIC_QUERY_EXECUTED", metadata: (output) => ({ count: String(output.count) }) } });
    const { deps, audit } = setup();
    await runCoreTool(audited, deps, { limit: 2 }, call());
    expect(audit.entries[0]).toMatchObject({ action: "SEMANTIC_QUERY_EXECUTED", metadata: { outcome: "succeeded", count: "2" } });
  });
});

describe("hashToolInput", () => {
  it("is stable across key order and differs by value", () => {
    expect(hashToolInput({ a: 1, b: { c: 2, d: 3 } })).toBe(hashToolInput({ b: { d: 3, c: 2 }, a: 1 }));
    expect(hashToolInput({ a: 1 })).not.toBe(hashToolInput({ a: 2 }));
    expect(hashToolInput({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
