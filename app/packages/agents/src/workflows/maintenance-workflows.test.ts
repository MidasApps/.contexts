import type { EvalExperimentSummary } from "@core/contracts";
import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import type { AnyWorkflow } from "@mastra/core/workflows";
import { describe, expect, it } from "vitest";
import { buildAgentContextEntries } from "../testing/agent-context-fixture.ts";
import { createApprovalExpirySweepWorkflow } from "./approval-expiry-sweep.workflow.ts";
import { createConversationPurgeWorkflow } from "./conversation-purge.workflow.ts";
import { createEvalExportWorkflow, EVAL_EXPORT_WINDOW_MS } from "./eval-export.workflow.ts";

const runOnce = async (workflow: AnyWorkflow, requestContext = new RequestContext<unknown>()) => {
  const mastra = new Mastra({ workflows: { [workflow.id]: workflow }, logger: false });
  const result = await (await mastra.getWorkflow(workflow.id).createRun()).start({ inputData: {}, requestContext });
  return result.status === "success" ? (result.result as unknown) : result.status;
};

const callerContext = () => new RequestContext<unknown>(buildAgentContextEntries());

const summary = (experimentId: string): EvalExperimentSummary => ({
  experimentId,
  datasetId: "assistant.v1",
  agentId: "assistant",
  promptVersionId: null,
  status: "completed",
  itemCount: 18,
  scores: [{ scorer: "tool-routing", mean: 0.94, baseline: 0.9 }],
  verdict: "passed",
  startedAt: "2026-09-30T12:00:00.000Z",
  finishedAt: "2026-09-30T12:03:00.000Z",
});

describe("approval-expiry-sweep", () => {
  it("runs both SP1 sweeps with the run id as request id", async () => {
    const calls: string[] = [];
    const workflow = createApprovalExpirySweepWorkflow({
      approvalSweeps: {
        expire: ({ requestId }) => (calls.push(`expire:${requestId.length > 0}`), Promise.resolve({ expired: 2 })),
        failInterrupted: () => (calls.push("fail"), Promise.resolve({ failed: 1 })),
      },
    });
    expect(await runOnce(workflow)).toEqual({ status: "done", expired: 2, failed: 1, code: null });
    expect(calls).toEqual(["expire:true", "fail"]);
  });

  it("refuses a run started by a caller (platform only)", async () => {
    const workflow = createApprovalExpirySweepWorkflow({
      approvalSweeps: {
        expire: () => Promise.reject(new Error("must not run")),
        failInterrupted: () => Promise.reject(new Error("must not run")),
      },
    });
    expect(await runOnce(workflow, callerContext())).toEqual({
      status: "failed",
      expired: 0,
      failed: 0,
      code: "PLATFORM_ONLY",
    });
  });
});

describe("conversation-purge", () => {
  it("purges through the port, deleting each thread with the memory", async () => {
    const deleted: string[] = [];
    const workflow = createConversationPurgeWorkflow({
      memory: { deleteThread: (threadId: string) => (deleted.push(threadId), Promise.resolve()) },
      conversationPurge: {
        purgeDeleted: async ({ deleteThread }) => {
          const results = await Promise.all(["c1", "c2"].map((id) => deleteThread(id)));
          return { purged: results.filter(Boolean).length, failed: 0 };
        },
      },
    });
    expect(await runOnce(workflow)).toEqual({ status: "done", purged: 2, failed: 0, code: null });
    expect(deleted).toEqual(["c1", "c2"]);
  });

  it("reports a thread that could not be deleted as not purged", async () => {
    const workflow = createConversationPurgeWorkflow({
      memory: { deleteThread: () => Promise.reject(new Error("storage down")) },
      conversationPurge: {
        purgeDeleted: async ({ deleteThread }) =>
          (await deleteThread("c1")) ? { purged: 1, failed: 0 } : { purged: 0, failed: 1 },
      },
    });
    expect(await runOnce(workflow)).toEqual({ status: "done", purged: 0, failed: 1, code: null });
  });
});

describe("eval-export", () => {
  it("exports the summaries finished in the last two days through the sink", async () => {
    const now = new Date("2026-10-01T05:00:00.000Z");
    const asked: string[] = [];
    const exported: EvalExperimentSummary[][] = [];
    const workflow = createEvalExportWorkflow({
      now: () => now,
      evalExport: {
        listFinishedSince: ({ since }) => (asked.push(since), Promise.resolve([summary("e1"), summary("e2")])),
        exportSummaries: (summaries) => (exported.push([...summaries]), Promise.resolve(summaries.length)),
      },
    });
    expect(await runOnce(workflow)).toEqual({ status: "done", experiments: 2, rows: 2, code: null });
    expect(asked).toEqual([new Date(now.getTime() - EVAL_EXPORT_WINDOW_MS).toISOString()]);
    expect(exported[0]?.map((row) => row.experimentId)).toEqual(["e1", "e2"]);
  });

  it("refuses a caller's run", async () => {
    const workflow = createEvalExportWorkflow({
      evalExport: {
        listFinishedSince: () => Promise.reject(new Error("no")),
        exportSummaries: () => Promise.reject(new Error("no")),
      },
    });
    expect(await runOnce(workflow, callerContext())).toMatchObject({ status: "failed", code: "PLATFORM_ONLY" });
  });
});
