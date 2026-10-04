import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publishEvalRuns, toEvalRunRecord } from "./publish-eval-runs.ts";

const REPORT = {
  agentId: "assistant",
  dataset: { name: "assistant.v1", version: 1, itemCount: 18 },
  verdict: "passed",
  startedAt: "2026-10-01T12:00:00.000Z",
  finishedAt: "2026-10-01T12:01:00.000Z",
  gate: {
    scorers: [
      { scorerId: "tool-routing", mean: 1, floor: 1 },
      { scorerId: "tenant-leak", mean: null, floor: 1 },
    ],
  },
  bigqueryRows: [{ git_sha: "abc1234" }],
};

describe("evals:publish", () => {
  it("maps a CI report to an experiment record with the scored means and baseline floors", () => {
    expect(toEvalRunRecord(REPORT)).toMatchObject({
      agentId: "assistant",
      datasetName: "assistant.v1",
      source: "ci",
      scores: [{ scorer: "tool-routing", mean: 1, baseline: 1 }],
      gitSha: "abc1234",
    });
    expect(toEvalRunRecord({ hello: "world" })).toBeNull();
  });

  it("is a no-op without a target and posts every report to /console/eval-runs with one", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "evals-"));
    writeFileSync(path.join(dir, "assistant.json"), JSON.stringify(REPORT));
    writeFileSync(path.join(dir, "notes.json"), JSON.stringify({ hello: "world" }));
    const calls: string[] = [];
    const fetchFn = ((url: string) => (
      calls.push(url), Promise.resolve(new Response(null, { status: 201 }))
    )) as unknown as typeof fetch;
    expect(await publishEvalRuns({ dir, targetUrl: undefined, fetch: fetchFn })).toEqual({
      published: [],
      skipped: [],
    });
    expect(await publishEvalRuns({ dir, targetUrl: "http://mastra.local/", fetch: fetchFn })).toEqual({
      published: ["assistant.json"],
      skipped: ["notes.json"],
    });
    expect(calls).toEqual(["http://mastra.local/console/eval-runs"]);
  });
});
