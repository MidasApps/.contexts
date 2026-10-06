import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { mergeWorkspaceOverrides } from "./output-overrides.ts";

const WORKSPACE = `packages:
  - apps/*
overrides:
  "firecrawl>axios": 1.20.0
`;

const OUTPUT = `packages:
  - '.'
overrides:
  "@core/agents": "file:./workspace-module/core-agents-0.0.0.tgz"
`;

describe("mergeWorkspaceOverrides", () => {
  it("adds the workspace overrides next to the deployer's own", () => {
    const merged = parse(mergeWorkspaceOverrides({ workspaceYaml: WORKSPACE, outputYaml: OUTPUT })) as {
      overrides: Record<string, string>;
      packages: string[];
    };
    expect(merged.overrides).toEqual({
      "@core/agents": "file:./workspace-module/core-agents-0.0.0.tgz",
      "firecrawl>axios": "1.20.0",
    });
    expect(merged.packages).toEqual(["."]);
  });

  it("keeps the deployer's override when both name the same package", () => {
    const merged = parse(
      mergeWorkspaceOverrides({ workspaceYaml: 'overrides:\n  "@core/agents": "9.9.9"\n', outputYaml: OUTPUT }),
    ) as { overrides: Record<string, string> };
    expect(merged.overrides["@core/agents"]).toBe("file:./workspace-module/core-agents-0.0.0.tgz");
  });

  it("leaves the output unchanged when the workspace has no overrides", () => {
    expect(mergeWorkspaceOverrides({ workspaceYaml: "packages: []\n", outputYaml: OUTPUT })).toBe(OUTPUT);
  });
});
