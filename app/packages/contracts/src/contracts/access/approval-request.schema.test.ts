import { describe, expect, it } from "vitest";
import { EXAMPLE_IDS } from "../example-values.ts";
import {
  APPROVAL_STATUSES,
  ApprovalRequestContract,
  ApprovalRequestSchema,
  CreateApprovalRequestInputContract,
  CreateApprovalRequestInputSchema,
  DecideApprovalRequestInputSchema,
} from "./approval-request.schema.ts";

const node = { level: "project", tenantId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project };
const input = {
  node,
  permission: "sample.invoice.delete",
  action: { kind: "sample-delete-invoice", input: { invoiceId: "inv-1" }, summary: "Delete invoice 42" },
};

describe("ApprovalRequestSchema", () => {
  it("covers every state of SP1 spec §4", () => {
    expect([...APPROVAL_STATUSES].sort()).toEqual(["approved", "cancelled", "executed", "expired", "failed", "pending", "rejected"]);
  });

  it("parses its catalog examples", () => {
    for (const contract of [ApprovalRequestContract, CreateApprovalRequestInputContract]) {
      for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
    }
  });

  it("keeps the safe failure of a failed request and refuses free text as its code (decision 0067)", () => {
    const [example] = ApprovalRequestContract.meta.examples;
    const failed = { ...(example as object), status: "failed", failure: { code: "EXECUTION_INTERRUPTED", requestId: "01J9Z3K8M2Q4R6T8V0W2X4Y6Z8" } };
    expect(ApprovalRequestSchema.parse(failed).failure).toEqual(failed.failure);
    expect(ApprovalRequestSchema.safeParse({ ...failed, failure: { ...failed.failure, code: "connection refused at 10.0.0.1" } }).success).toBe(false);
    expect(ApprovalRequestSchema.parse(example).failure).toBeUndefined();
  });

  it("rejects an unknown status", () => {
    const [example] = ApprovalRequestContract.meta.examples;
    expect(ApprovalRequestSchema.safeParse({ ...(example as object), status: "done" }).success).toBe(false);
  });
});

describe("CreateApprovalRequestInputSchema", () => {
  it("accepts an action with kind, input and summary at a tenant node", () => {
    expect(CreateApprovalRequestInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects a platform node, a malformed kind, a missing summary and an unknown key", () => {
    expect(CreateApprovalRequestInputSchema.safeParse({ ...input, node: { level: "platform" } }).success).toBe(false);
    expect(CreateApprovalRequestInputSchema.safeParse({ ...input, action: { ...input.action, kind: "Delete Invoice" } }).success).toBe(false);
    expect(CreateApprovalRequestInputSchema.safeParse({ ...input, action: { kind: "x", input: {} } }).success).toBe(false);
    expect(CreateApprovalRequestInputSchema.safeParse({ ...input, status: "approved" }).success).toBe(false);
  });
});

describe("DecideApprovalRequestInputSchema", () => {
  it("takes an optional reason of at most 500 chars", () => {
    expect(DecideApprovalRequestInputSchema.parse({})).toEqual({});
    expect(DecideApprovalRequestInputSchema.safeParse({ reason: "Looks right." }).success).toBe(true);
    expect(DecideApprovalRequestInputSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
    expect(DecideApprovalRequestInputSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});
