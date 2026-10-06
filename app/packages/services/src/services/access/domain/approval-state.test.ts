import type { ApprovalStatus } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { type ApprovalTransition, effectiveApprovalStatus, nextApprovalStatus } from "./approval-state.ts";

const ALL: readonly ApprovalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "executed",
  "failed",
];
const TRANSITIONS: readonly ApprovalTransition[] = ["approve", "reject", "cancel", "expire", "execute", "fail"];

describe("nextApprovalStatus", () => {
  it("moves pending to approved, rejected, cancelled or expired", () => {
    expect(nextApprovalStatus("pending", "approve")).toBe("approved");
    expect(nextApprovalStatus("pending", "reject")).toBe("rejected");
    expect(nextApprovalStatus("pending", "cancel")).toBe("cancelled");
    expect(nextApprovalStatus("pending", "expire")).toBe("expired");
    expect(nextApprovalStatus("pending", "execute")).toBeNull();
  });

  it("moves approved only to executed or failed", () => {
    expect(nextApprovalStatus("approved", "execute")).toBe("executed");
    expect(nextApprovalStatus("approved", "fail")).toBe("failed");
    expect(nextApprovalStatus("approved", "approve")).toBeNull();
    expect(nextApprovalStatus("approved", "reject")).toBeNull();
  });

  it("keeps every terminal state terminal", () => {
    for (const status of ALL.filter((candidate) => candidate !== "pending" && candidate !== "approved")) {
      for (const transition of TRANSITIONS) expect(nextApprovalStatus(status, transition)).toBeNull();
    }
  });
});

describe("effectiveApprovalStatus", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("reports a pending request past its expiry as expired, and nothing else", () => {
    expect(effectiveApprovalStatus({ status: "pending", expiresAt: "2026-09-30T12:00:00.000Z" }, now)).toBe("expired");
    expect(effectiveApprovalStatus({ status: "pending", expiresAt: "2026-09-30T12:00:01.000Z" }, now)).toBe("pending");
    expect(effectiveApprovalStatus({ status: "approved", expiresAt: "2026-09-01T00:00:00.000Z" }, now)).toBe(
      "approved",
    );
  });
});
