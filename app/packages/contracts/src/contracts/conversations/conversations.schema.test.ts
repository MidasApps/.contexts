import { describe, expect, it } from "vitest";
import { CHAT_PERMISSIONS } from "./chat-permissions.ts";
import {
  ChatRequestContract,
  ChatRequestSchema,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_TEXT_CHARS,
} from "./chat-request.schema.ts";
import { ConversationContract, ConversationIdSchema } from "./conversation.schema.ts";
import { ConversationPatchContract, ConversationPatchSchema } from "./conversation-patch.schema.ts";
import { MessageMetadataContract } from "./message-metadata.schema.ts";
import { ToolApprovalDecisionContract } from "./tool-approval-decision.schema.ts";

const contracts = [
  ConversationContract,
  ChatRequestContract,
  ConversationPatchContract,
  MessageMetadataContract,
  ToolApprovalDecisionContract,
];

const ORG = "Jd8sK2lPq0WnR5tYu3bV";
const userMessage = { id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] };
const approvalPart = {
  type: "tool-command_tenancy_CreateProjectInput",
  toolCallId: "call-1",
  state: "approval-responded",
  approval: { id: "run-1::call-1", approved: false, reason: "Not now." },
};

describe("conversation contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))(
    "%s: every example parses",
    (_id, contract) => {
      for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
    },
  );

  it.each(contracts.map((contract) => [contract.id, contract] as const))(
    "%s: rejects an unknown key",
    (_id, contract) => {
      const [example] = contract.meta.examples;
      expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
    },
  );

  it("accepts only ids that are safe as memory thread ids", () => {
    expect(ConversationIdSchema.safeParse("Cv3xZ5aB7nM9qW1eR2tY").success).toBe(true);
    for (const id of ["a/b", "a.b", "", "x".repeat(129)])
      expect(ConversationIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("ChatRequestSchema", () => {
  it("accepts a user text turn in an organization", () => {
    expect(ChatRequestSchema.safeParse({ organizationId: ORG, message: userMessage }).success).toBe(true);
  });

  it("requires the organization when no conversation is named", () => {
    expect(ChatRequestSchema.safeParse({ message: userMessage }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ conversationId: "Cv3xZ5aB7nM9qW1eR2tY", message: userMessage }).success).toBe(
      true,
    );
  });

  it("rejects the system role", () => {
    expect(
      ChatRequestSchema.safeParse({ organizationId: ORG, message: { ...userMessage, role: "system" } }).success,
    ).toBe(false);
  });

  it("rejects text longer than the cap", () => {
    const parts = [{ type: "text", text: "a".repeat(MAX_CHAT_TEXT_CHARS + 1) }];
    expect(ChatRequestSchema.safeParse({ organizationId: ORG, message: { ...userMessage, parts } }).success).toBe(
      false,
    );
  });

  it("rejects file parts: files come only by id", () => {
    const parts = [{ type: "file", mediaType: "image/png", url: "https://example.com/a.png" }];
    expect(ChatRequestSchema.safeParse({ organizationId: ORG, message: { ...userMessage, parts } }).success).toBe(
      false,
    );
  });

  it(`rejects more than ${MAX_CHAT_ATTACHMENTS} attachments and repeated ones`, () => {
    const many = Array.from(
      { length: MAX_CHAT_ATTACHMENTS + 1 },
      (_, index) => `Fz9sK2lPq0WnR5tYu3b${String.fromCharCode(65 + index)}`,
    );
    expect(ChatRequestSchema.safeParse({ organizationId: ORG, message: userMessage, attachments: many }).success).toBe(
      false,
    );
    expect(
      ChatRequestSchema.safeParse({
        organizationId: ORG,
        message: userMessage,
        attachments: ["Fz9sK2lPq0WnR5tYu3bV", "Fz9sK2lPq0WnR5tYu3bV"],
      }).success,
    ).toBe(false);
  });

  it("accepts an assistant message carrying approval responses only", () => {
    const message = { id: "m2", role: "assistant", parts: [approvalPart] };
    expect(ChatRequestSchema.safeParse({ conversationId: "Cv3xZ5aB7nM9qW1eR2tY", message }).success).toBe(true);
    const withText = { ...message, parts: [approvalPart, { type: "text", text: "hi" }] };
    expect(ChatRequestSchema.safeParse({ conversationId: "Cv3xZ5aB7nM9qW1eR2tY", message: withText }).success).toBe(
      false,
    );
    const pending = { ...message, parts: [{ ...approvalPart, state: "approval-requested" }] };
    expect(ChatRequestSchema.safeParse({ conversationId: "Cv3xZ5aB7nM9qW1eR2tY", message: pending }).success).toBe(
      false,
    );
  });

  it("rejects attachments on an approval response", () => {
    const message = { id: "m2", role: "assistant", parts: [approvalPart] };
    expect(
      ChatRequestSchema.safeParse({
        conversationId: "Cv3xZ5aB7nM9qW1eR2tY",
        message,
        attachments: ["Fz9sK2lPq0WnR5tYu3bV"],
      }).success,
    ).toBe(false);
  });
});

describe("ConversationPatchSchema", () => {
  it("needs at least one field", () => {
    expect(ConversationPatchSchema.safeParse({}).success).toBe(false);
    expect(ConversationPatchSchema.safeParse({ pinned: true }).success).toBe(true);
  });

  it("rejects a blank title", () => {
    expect(ConversationPatchSchema.safeParse({ title: "   " }).success).toBe(false);
  });
});

describe("CHAT_PERMISSIONS", () => {
  it("grants every chat permission to members by default", () => {
    expect(CHAT_PERMISSIONS.map((permission) => permission.id)).toEqual([
      "core.conversation.send",
      "core.conversation.read",
      "core.conversation.update",
      "core.conversation.delete",
      "core.voice.use",
    ]);
    for (const permission of CHAT_PERMISSIONS) expect(permission.defaultRoles).toEqual(["owner", "admin", "member"]);
  });
});
