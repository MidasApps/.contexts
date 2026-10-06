import { describe, expect, it } from "vitest";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { waitingForDecision } from "./use-approval-requests.ts";

describe("waitingForDecision", () => {
  it("keeps pending requests asked by someone else (four eyes: never the viewer's own)", () => {
    const other = buildApprovalRequest({ id: "Ap1qW2eR3tY4uI5oP6aS" });
    const own = buildApprovalRequest({ id: "Ap2qW2eR3tY4uI5oP6aS", requestedBy: { type: "user", id: "viewer-uid" } });
    const settled = buildApprovalRequest({ id: "Ap3qW2eR3tY4uI5oP6aS", status: "executed" });
    expect(waitingForDecision([other, own, settled], "viewer-uid").map((request) => request.id)).toEqual([
      "Ap1qW2eR3tY4uI5oP6aS",
    ]);
  });
});
