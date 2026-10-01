import { describe, expect, it } from "vitest";
import { createLogger } from "../../shared/observability/logger.ts";
import type { WorkflowApprovalSettler } from "./ports/workflow-approval-settler.ts";
import { makeSettleOnApprovalUpdate } from "./settle-on-approval-update.ts";

const logger = createLogger({ context: { service: "test", env: "local" }, sink: () => undefined });

const doc = (status: string, kind = "workflow-resume") => ({ status, action: { kind, input: {}, summary: "s" }, tenantId: "t1" });

const setup = (answer: Awaited<ReturnType<WorkflowApprovalSettler["settle"]>> = { ok: true, data: { settled: true, runStatus: "success" } }) => {
  const calls: string[] = [];
  const settle = makeSettleOnApprovalUpdate({
    settler: {
      settle: ({ approvalRequestId }) => {
        calls.push(approvalRequestId);
        return Promise.resolve(answer);
      },
    },
    logger,
  });
  return { settle, calls };
};

describe("settle on approval request update (Functions trigger, decision 0036)", () => {
  it.each(["rejected", "expired", "cancelled"])("settles a workflow-resume request that became %s", async (status) => {
    const { settle, calls } = setup();
    expect(await settle({ approvalRequestId: "ar1", before: doc("pending"), after: doc(status), requestId: "evt" })).toBe("settled");
    expect(calls).toEqual(["ar1"]);
  });

  it("ignores approvals, executions and failures (the handler owns approvals)", async () => {
    const { settle, calls } = setup();
    for (const status of ["approved", "executed", "failed"]) {
      expect(await settle({ approvalRequestId: "ar1", before: doc("pending"), after: doc(status), requestId: "evt" })).toBe("ignored");
    }
    expect(calls).toEqual([]);
  });

  it("ignores other kinds, unchanged statuses, deletions and malformed documents", async () => {
    const { settle, calls } = setup();
    expect(await settle({ approvalRequestId: "ar1", before: doc("pending", "agent-command"), after: doc("rejected", "agent-command"), requestId: "e" })).toBe("ignored");
    expect(await settle({ approvalRequestId: "ar1", before: doc("rejected"), after: doc("rejected"), requestId: "e" })).toBe("ignored");
    expect(await settle({ approvalRequestId: "ar1", before: doc("pending"), after: undefined, requestId: "e" })).toBe("ignored");
    expect(await settle({ approvalRequestId: "ar1", before: undefined, after: { status: 42 }, requestId: "e" })).toBe("ignored");
    expect(calls).toEqual([]);
  });

  it("is idempotent: a run that no longer waits is fine", async () => {
    const { settle } = setup({ ok: true, data: { settled: false, reason: "NOT_SUSPENDED" } });
    expect(await settle({ approvalRequestId: "ar1", before: doc("pending"), after: doc("rejected"), requestId: "e" })).toBe("skipped");
  });

  it("throws on a gateway failure so the trigger retries", async () => {
    const { settle } = setup({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
    await expect(settle({ approvalRequestId: "ar1", before: doc("pending"), after: doc("expired"), requestId: "e" })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
});
