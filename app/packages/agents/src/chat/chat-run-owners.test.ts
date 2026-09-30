import { describe, expect, it } from "vitest";
import { approvalRunIdsOf, createChatRunOwners } from "./chat-run-owners.ts";

const OWNER = { resourceId: "tenant:uid", threadId: "Thread0000000000001", agentId: "assistant" };

describe("createChatRunOwners", () => {
  it("returns the owner of a recorded run and nothing for an unknown run", () => {
    const owners = createChatRunOwners();
    owners.record("run-1", OWNER);
    expect(owners.ownerOf("run-1")).toMatchObject({ ...OWNER, state: "running" });
    expect(owners.ownerOf("run-2")).toBeUndefined();
  });

  it("tracks the run state", () => {
    const owners = createChatRunOwners();
    owners.record("run-1", OWNER);
    owners.markState("run-1", "suspended");
    expect(owners.ownerOf("run-1")?.state).toBe("suspended");
    owners.markState("unknown", "finished");
    expect(owners.ownerOf("unknown")).toBeUndefined();
  });

  it("forgets a run after its time to live", () => {
    let now = 0;
    const owners = createChatRunOwners({ ttlMs: 1_000, now: () => now });
    owners.record("run-1", OWNER);
    now = 999;
    expect(owners.ownerOf("run-1")).toBeDefined();
    now = 1_001;
    expect(owners.ownerOf("run-1")).toBeUndefined();
  });

  it("keeps at most maxRuns entries, dropping the oldest", () => {
    const owners = createChatRunOwners({ maxRuns: 2 });
    for (const runId of ["a", "b", "c"]) owners.record(runId, OWNER);
    expect(owners.ownerOf("a")).toBeUndefined();
    expect(owners.ownerOf("c")).toBeDefined();
  });

  it("isOwnedBy requires the same resource and thread", () => {
    const owners = createChatRunOwners();
    owners.record("run-1", OWNER);
    expect(owners.isOwnedBy("run-1", { resourceId: OWNER.resourceId, threadId: OWNER.threadId })).toBe(true);
    expect(owners.isOwnedBy("run-1", { resourceId: "other:uid", threadId: OWNER.threadId })).toBe(false);
    expect(owners.isOwnedBy("run-1", { resourceId: OWNER.resourceId, threadId: "OtherThread00000001" })).toBe(false);
    expect(owners.isOwnedBy("missing", { resourceId: OWNER.resourceId, threadId: OWNER.threadId })).toBe(false);
  });
});

describe("approvalRunIdsOf", () => {
  it("reads the run ids of responded approvals whose tool call matches", () => {
    const parts = [
      { type: "step-start" },
      { type: "tool-agent-action", toolCallId: "call-1", state: "approval-responded", approval: { id: "run-9::call-1", approved: true } },
      { type: "tool-agent-action", toolCallId: "call-2", state: "approval-requested", approval: { id: "run-9::call-2" } },
      { type: "tool-agent-action", toolCallId: "call-3", state: "approval-responded", approval: { id: "run-8::other" } },
      { type: "tool-agent-action", toolCallId: "call-4", state: "approval-responded", approval: { id: "no-separator" } },
    ];
    expect(approvalRunIdsOf(parts)).toEqual(["run-9"]);
  });

  it("returns each run once", () => {
    const part = (toolCallId: string) => ({ type: "dynamic-tool", toolCallId, state: "approval-responded", approval: { id: `run-1::${toolCallId}`, approved: false } });
    expect(approvalRunIdsOf([part("a"), part("b")])).toEqual(["run-1"]);
  });
});
