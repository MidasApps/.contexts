import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_ASSETS, missingBundledAssets } from "./agent-assets.ts";

const write = (file: string) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "x");
};

describe("bundled agent assets", () => {
  it("copies the eval datasets and baselines next to the bundle, like instructions and skills", () => {
    expect(AGENT_ASSETS.map((asset) => asset.bundled)).toEqual(["instructions", "skills", "evals"]);
    expect(AGENT_ASSETS.find((asset) => asset.bundled === "evals")).toMatchObject({
      source: "../../packages/agents/evals",
      target: "src/mastra/public/evals",
    });
  });

  it("names every source file the output lacks, and nothing once the copy is complete", () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-assets-"));
    try {
      const source = path.join(root, "src-evals");
      const output = path.join(root, "output");
      const assets = [{ source, target: "unused", bundled: "evals" }] as const;
      write(path.join(source, "datasets", "data.v1.jsonl"));
      write(path.join(source, "baselines", "data.json"));
      write(path.join(output, "evals", "datasets", "data.v1.jsonl"));
      expect(missingBundledAssets({ assets, outputDir: output })).toEqual([
        path.join("evals", "baselines", "data.json"),
      ]);
      write(path.join(output, "evals", "baselines", "data.json"));
      expect(missingBundledAssets({ assets, outputDir: output })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports an empty or absent source as missing, so a broken checkout cannot pass", () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-assets-"));
    try {
      const assets = [{ source: path.join(root, "nothing"), target: "unused", bundled: "evals" }] as const;
      expect(missingBundledAssets({ assets, outputDir: path.join(root, "output") })).toEqual(["evals"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
