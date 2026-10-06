import { describe, expect, it } from "vitest";
import { findPinDrift, lockfileVersions } from "./mastra-output-pins.ts";

const WORKSPACE_LOCK = `lockfileVersion: '9.0'

importers:

  apps/mastra:
    dependencies:
      '@mastra/core':
        specifier: 'catalog:'
        version: 1.71.0(zod@4.6.5)

packages:

  '@mastra/core@1.71.0':
    resolution: {integrity: sha512-a}

  axios@1.18.0:
    resolution: {integrity: sha512-b}

  zod@3.25.76:
    resolution: {integrity: sha512-c}

  zod@4.6.5:
    resolution: {integrity: sha512-d}

snapshots:

  '@mastra/core@1.71.0(zod@4.6.5)':
    dependencies:
      zod: 4.6.5
`;

const outputLock = (packages: string) => `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@mastra/core':
        specifier: 1.71.0
        version: 1.71.0

packages:

${packages}
snapshots:

  '@mastra/core@1.71.0': {}
`;

describe("lockfileVersions", () => {
  it("reads every name@version of the packages section, scoped names included", () => {
    const versions = lockfileVersions(WORKSPACE_LOCK);
    expect([...(versions.get("@mastra/core") ?? [])]).toEqual(["1.71.0"]);
    expect([...(versions.get("zod") ?? [])].sort()).toEqual(["3.25.76", "4.6.5"]);
    expect(versions.has("snapshots")).toBe(false);
  });
});

describe("findPinDrift", () => {
  it("passes when every shared package resolves to a version the workspace lockfile has", () => {
    const output = outputLock(
      "  '@mastra/core@1.71.0':\n    resolution: {integrity: x}\n\n  zod@4.6.5:\n    resolution: {integrity: y}\n\n  left-pad@1.3.0:\n    resolution: {integrity: z}\n",
    );
    expect(findPinDrift({ workspaceLock: WORKSPACE_LOCK, outputLock: output })).toEqual([]);
  });

  it("reports a shared package the nested install resolved differently", () => {
    const output = outputLock(
      "  '@mastra/core@1.72.0':\n    resolution: {integrity: x}\n\n  axios@1.18.1:\n    resolution: {integrity: y}\n",
    );
    expect(findPinDrift({ workspaceLock: WORKSPACE_LOCK, outputLock: output })).toEqual([
      { name: "@mastra/core", output: ["1.72.0"], workspace: ["1.71.0"] },
      { name: "axios", output: ["1.18.1"], workspace: ["1.18.0"] },
    ]);
  });

  it("ignores the workspace tarballs the deployer packs (file: specifiers)", () => {
    const output = outputLock(
      "  '@core/agents@file:workspace-module/core-agents-0.0.0.tgz':\n    resolution: {tarball: file:x}\n",
    );
    expect(findPinDrift({ workspaceLock: WORKSPACE_LOCK, outputLock: output })).toEqual([]);
  });
});
