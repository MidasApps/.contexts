import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApprovalHandlerRegistryError, createApprovalHandlerRegistry } from "./approval-handler-registry.ts";
import type { ApprovalActionHandler } from "./ports/driven/approval-action-handler.ts";

const handler = (kind: string): ApprovalActionHandler => ({
  kind,
  inputSchema: z.unknown(),
  execute: () => Promise.resolve(),
});

describe("createApprovalHandlerRegistry", () => {
  it("finds registered handlers, including ones registered after composition (SP3, SP5)", () => {
    const registry = createApprovalHandlerRegistry([handler("sample-action")]);
    expect(registry.get("agent-command")).toBeUndefined();
    registry.register(handler("agent-command"));
    expect(registry.get("agent-command")?.kind).toBe("agent-command");
    expect(registry.kinds()).toEqual(["agent-command", "sample-action"]);
  });

  it("refuses duplicate and non-kebab-case kinds", () => {
    const registry = createApprovalHandlerRegistry([handler("sample-action")]);
    expect(() => registry.register(handler("sample-action"))).toThrow(ApprovalHandlerRegistryError);
    expect(() => registry.register(handler("Sample_Action"))).toThrow(/APPROVAL_HANDLER_KIND_INVALID/);
  });
});
