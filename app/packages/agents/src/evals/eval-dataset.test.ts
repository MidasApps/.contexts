import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { datasetFileOf, EVAL_AGENT_IDS, loadEvalDataset, parseEvalDataset, resolveEvalsDir } from "./eval-dataset.ts";

describe("eval datasets", () => {
  it.each(EVAL_AGENT_IDS)("%s.v1.jsonl has 10-30 valid cases with unique ids", (agentId) => {
    const dataset = loadEvalDataset(agentId);
    expect(dataset).toMatchObject({ agentId, version: 1, name: `${agentId}.v1` });
    expect(dataset.cases.length).toBeGreaterThanOrEqual(10);
    expect(dataset.cases.length).toBeLessThanOrEqual(30);
    expect(new Set(dataset.cases.map((item) => item.id)).size).toBe(dataset.cases.length);
    expect(dataset.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names the file by agent and version", () => {
    expect(datasetFileOf("assistant", 1)).toMatch(/evals[\\/]datasets[\\/]assistant\.v1\.jsonl$/);
  });

  it("reports the line of an invalid case", () => {
    expect(() =>
      parseEvalDataset({ agentId: "data", version: 1, text: '{"id":"ok","input":"hi"}\n{"id":"bad"}\n' }),
    ).toThrow(/line 2/);
  });

  it("skips blank lines and keeps the case expectations as ground truth", () => {
    const dataset = parseEvalDataset({
      agentId: "data",
      version: 1,
      text: '\n{"id":"a","input":"Which entities exist?","expectedTools":["catalog.listEntities"]}\n\n',
    });
    expect(dataset.cases).toEqual([
      {
        id: "a",
        input: "Which entities exist?",
        tags: [],
        groundTruth: {
          expectedTools: ["catalog.listEntities"],
          forbiddenTools: [],
          expectCitations: false,
          foreignMarkers: [],
        },
      },
    ]);
  });

  it("finds the bundled copy first and falls back to the package folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "evals-dir-"));
    try {
      const bundled = path.join(root, "output", "evals");
      const source = path.join(root, "package", "evals");
      mkdirSync(path.join(source, "datasets"), { recursive: true });
      expect(resolveEvalsDir([bundled, source])).toBe(source);
      mkdirSync(path.join(bundled, "datasets"), { recursive: true });
      expect(resolveEvalsDir([bundled, source])).toBe(bundled);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
