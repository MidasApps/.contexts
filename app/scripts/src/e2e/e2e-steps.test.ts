import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildE2eSteps } from "./e2e-steps.ts";

const ROOT = path.join("C:", "repo", "app");
const resolveBin = ({ fromDir, packageName }: { fromDir: string; packageName: string }) =>
  path.join(fromDir, "node_modules", packageName, "bin.js");

describe("buildE2eSteps (follow-up 87)", () => {
  it("builds through turbo, then runs Playwright directly in web and then desktop", () => {
    const steps = buildE2eSteps({ appRoot: ROOT, resolveBin });
    expect(steps.map((step) => step.label)).toEqual(["build", "web", "desktop"]);
    const [build, web, desktop] = steps;
    expect(build?.args).toEqual([
      path.join(ROOT, "node_modules", "turbo", "bin.js"),
      "run",
      "build",
      "--filter=@core/web",
      "--filter=@core/desktop",
      "--filter=@core/mastra",
      "--env-mode=loose",
    ]);
    expect(web).toMatchObject({
      cwd: path.join(ROOT, "apps", "web"),
      args: [path.join(ROOT, "apps", "web", "node_modules", "@playwright/test", "bin.js"), "test"],
    });
    expect(desktop).toMatchObject({
      cwd: path.join(ROOT, "apps", "desktop"),
      args: [path.join(ROOT, "apps", "desktop", "node_modules", "@playwright/test", "bin.js"), "test"],
    });
  });

  it("never runs a Playwright task through turbo, whose process stayed alive on Windows after the run", () => {
    const steps = buildE2eSteps({ appRoot: ROOT, resolveBin });
    expect(steps.some((step) => step.args.includes("test:e2e"))).toBe(false);
  });
});
