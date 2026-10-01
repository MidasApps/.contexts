import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { linkCitationMarkers } from "./citation-markers.ts";
import {
  approvalRequestOf,
  attachmentsOf,
  collectSources,
  delegationOf,
  generativeUiOf,
  isLowConfidence,
  pendingApprovalOf,
  textOf,
  toolPartOf,
  toolPreviewOf,
  tripwireOf,
} from "./part-guards.ts";

const KB_1 = "kb:01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f#3";
const KB_2 = "kb:01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f#7";

describe("toolPartOf", () => {
  it("reads static and dynamic tool parts", () => {
    expect(toolPartOf({ type: "tool-catalog_listEntities", toolCallId: "c-1", state: "input-available", input: {} })).toMatchObject({ toolName: "catalog_listEntities", state: "input-available" });
    expect(toolPartOf({ type: "dynamic-tool", toolName: "mcp_search", toolCallId: "c-2", state: "output-error", errorText: "boom" })).toMatchObject({ toolName: "mcp_search", errorText: "boom" });
  });

  it("keeps the approval of a part", () => {
    expect(toolPartOf({ type: "tool-agent-action", toolCallId: "c-1", state: "approval-requested", approval: { id: "run::c-1" } })?.approval).toEqual({ id: "run::c-1" });
  });

  it.each([
    [{ type: "text", text: "x" }],
    [{ type: "tool-x", state: "output-available" }],
    [{ type: "tool-x", toolCallId: "c", state: "made-up" }],
    [{ type: "dynamic-tool", toolCallId: "c", state: "output-available" }],
    [{ type: "tool-", toolCallId: "c", state: "output-available" }],
  ])("answers null for %j", (part) => {
    expect(toolPartOf(part)).toBeNull();
  });
});

describe("delegationOf", () => {
  it("reads the subagent, its request, its answer and its tool calls", () => {
    const tool = toolPartOf({
      type: "tool-agent-knowledge",
      toolCallId: "c-1",
      state: "output-available",
      input: { prompt: "Qual é o prazo?" },
      output: { text: "30 dias.", subAgentToolResults: [{ toolName: "knowledge_searchKnowledge", toolCallId: "s-1", result: { results: [] }, args: { query: "prazo" } }, "junk"] },
    });
    expect(tool).not.toBeNull();
    expect(delegationOf(tool!)).toEqual({
      agentId: "knowledge",
      prompt: "Qual é o prazo?",
      text: "30 dias.",
      steps: [{ toolName: "knowledge_searchKnowledge", toolCallId: "s-1", result: { results: [] }, args: { query: "prazo" }, isError: false }],
    });
  });

  it("is null for a plain tool and tolerates a missing output", () => {
    expect(delegationOf(toolPartOf({ type: "tool-web_search", toolCallId: "c", state: "input-available" })!)).toBeNull();
    expect(delegationOf(toolPartOf({ type: "tool-agent-data", toolCallId: "c", state: "input-streaming" })!)).toEqual({ agentId: "data", prompt: undefined, text: undefined, steps: [] });
  });
});

describe("data parts", () => {
  it("reads a tripwire with its processor", () => {
    expect(tripwireOf({ type: "data-tripwire", data: { reason: "BUDGET_EXCEEDED", metadata: { processorId: "tenant-budget-guard" } } })).toEqual({ processorId: "tenant-budget-guard", reason: "BUDGET_EXCEEDED" });
    expect(tripwireOf({ type: "data-tripwire" })).toEqual({ processorId: undefined, reason: undefined });
    expect(tripwireOf({ type: "data-other" })).toBeNull();
  });

  it("reads the tool preview and the approval request", () => {
    const preview = { type: "data-tool-preview", data: { toolCallId: "c-1", toolName: "command_tenancy_CreateProjectInput", toolId: "command.tenancy.CreateProjectInput", permission: "core.project.create", summary: "Criar projeto Launch", preview: { before: null, after: { name: "Launch" } } } };
    expect(toolPreviewOf(preview)).toEqual({ toolCallId: "c-1", toolName: "command_tenancy_CreateProjectInput", toolId: "command.tenancy.CreateProjectInput", permission: "core.project.create", summary: "Criar projeto Launch", preview: { before: null, after: { name: "Launch" } } });
    expect(toolPreviewOf({ type: "data-tool-preview", data: { toolCallId: "c-1", toolName: "mcp_tool", preview: null } })?.preview).toBeNull();
    expect(toolPreviewOf({ type: "data-tool-preview", data: { toolName: "x" } })).toBeNull();
    expect(approvalRequestOf({ type: "data-tool-call-approval", data: { toolCallId: "c-1", toolName: "command_x", args: { name: "Launch" } } })).toEqual({ toolCallId: "c-1", toolName: "command_x", args: { name: "Launch" } });
  });

  it("recognizes generative UI and pending approvals in tool outputs", () => {
    expect(generativeUiOf({ ui: { component: "schema-form", props: { a: 1 } } })).toEqual({ component: "schema-form", props: { a: 1 } });
    expect(generativeUiOf({ ui: { props: {} } })).toBeNull();
    expect(generativeUiOf("ui")).toBeNull();
    expect(pendingApprovalOf({ status: "pending-approval", approvalId: "ap-1" })).toEqual({ approvalId: "ap-1" });
    expect(pendingApprovalOf({ status: "done" })).toBeNull();
  });
});

describe("message metadata", () => {
  const message = (metadata: unknown): UIMessage => ({ id: "m", role: "assistant", metadata, parts: [{ type: "text", text: "a" }, { type: "text", text: "b" }] });

  it("flags only low confidence", () => {
    expect(isLowConfidence(message({ confidence: "low" }))).toBe(true);
    expect(isLowConfidence(message({ confidence: "grounded" }))).toBe(false);
    expect(isLowConfidence(message(undefined))).toBe(false);
  });

  it("lists well-formed attachments only", () => {
    expect(attachmentsOf(message({ attachments: [{ fileId: "f-1", name: "a.png", mediaType: "image/png", sizeBytes: 10 }, { name: "no id" }, 3] }))).toEqual([{ fileId: "f-1", name: "a.png", mediaType: "image/png", sizeBytes: 10 }]);
  });

  it("joins the text parts", () => {
    expect(textOf(message(undefined))).toBe("a\n\nb");
  });
});

describe("collectSources", () => {
  it("collects source parts and knowledge passages, direct or through a subagent", () => {
    const passage = (citationId: string, title: string) => ({ citationId, documentId: "d", title, sourceUrl: null, snippet: `trecho ${title}`, score: 0.8 });
    const sources = collectSources([
      { type: "source-url", sourceId: "web-1", url: "https://example.com", title: "Example" },
      { type: "tool-knowledge_searchKnowledge", toolCallId: "c-1", state: "output-available", output: { results: [passage(KB_1.toUpperCase(), "Guia")] } },
      { type: "tool-agent-knowledge", toolCallId: "c-2", state: "output-available", output: { text: "x", subAgentToolResults: [{ toolName: "knowledge_searchKnowledge", toolCallId: "s-1", result: { results: [passage(KB_2, "Manual"), passage(KB_1, "Duplicado")] } }] } },
    ]);
    expect([...sources.keys()]).toEqual(["web-1", KB_1, KB_2]);
    expect(sources.get(KB_1)).toEqual({ id: KB_1, title: "Guia", url: undefined, snippet: "trecho Guia" });
  });
});

describe("linkCitationMarkers", () => {
  it("numbers markers by first appearance and reuses the number of a repeated source", () => {
    const { text, order } = linkCitationMarkers(`Prazo de 30 dias [${KB_1}]. Multa de 2% [${KB_2}] e juros [${KB_1.toUpperCase()}].`);
    expect(text).toBe("Prazo de 30 dias[1](#cite-1). Multa de 2%[2](#cite-2) e juros[1](#cite-1).");
    expect(order).toEqual([KB_1, KB_2]);
  });

  it("continues the numbering of the previous part", () => {
    expect(linkCitationMarkers(`Outro [${KB_2}].`, [KB_1])).toEqual({ text: "Outro[2](#cite-2).", order: [KB_1, KB_2] });
  });

  it("hides a marker cut by streaming and leaves other brackets alone", () => {
    expect(linkCitationMarkers("Prazo [kb:01928f6e-7b2a").text).toBe("Prazo");
    expect(linkCitationMarkers("Lista [a] e [kb:not-a-marker].").text).toBe("Lista [a] e [kb:not-a-marker].");
  });
});
