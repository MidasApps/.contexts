// Runs after `mastra build` (SP0 follow-up #2, decision 0023 D3-20):
// 0. the workspace `overrides` (security pins) are copied into the output's
//    pnpm-workspace.yaml, which the deployer's nested install ignores, and the output is
//    installed again when that changed;
// 1. the nested `pnpm install` of `.mastra/output` must resolve every package it shares with
//    the workspace to a version of the workspace lockfile (no silent drift);
// 2. `pnpm audit --prod --audit-level high` must pass on the output's own lockfile.
// `--no-audit` skips step 2 (offline builds); CI and the image build run both steps.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findPinDrift } from "../src/build/mastra-output-pins.ts";
import { mergeWorkspaceOverrides } from "../src/build/output-overrides.ts";

const APP_DIR = path.resolve(import.meta.dirname, "..");
const OUTPUT_DIR = path.join(APP_DIR, ".mastra", "output");
const WORKSPACE_LOCK = path.resolve(APP_DIR, "../../pnpm-lock.yaml");
const OUTPUT_LOCK = path.join(OUTPUT_DIR, "pnpm-lock.yaml");
const WORKSPACE_YAML = path.resolve(APP_DIR, "../../pnpm-workspace.yaml");
const OUTPUT_YAML = path.join(OUTPUT_DIR, "pnpm-workspace.yaml");
// Through the shell (pnpm is a .cmd shim on Windows); every command below is a constant.
const pnpmIn = (command: string) => spawnSync(`pnpm ${command}`, { cwd: OUTPUT_DIR, stdio: "inherit", shell: true });

const fail = (message: string): never => {
  process.stderr.write(`[check-mastra-output] ${message}\n`);
  process.exit(1);
};

if (!existsSync(OUTPUT_LOCK)) fail(`no lockfile in ${path.relative(APP_DIR, OUTPUT_DIR)}; run mastra build first`);
const outputYaml = readFileSync(OUTPUT_YAML, "utf8");
const mergedYaml = mergeWorkspaceOverrides({ workspaceYaml: readFileSync(WORKSPACE_YAML, "utf8"), outputYaml });
if (mergedYaml !== outputYaml) {
  writeFileSync(OUTPUT_YAML, mergedYaml);
  process.stdout.write("[check-mastra-output] workspace overrides copied into the output; installing it again\n");
  const install = pnpmIn("install --prod");
  if (install.status !== 0) fail(`pnpm install in the output failed (exit ${String(install.status)})`);
}
const drift = findPinDrift({ workspaceLock: readFileSync(WORKSPACE_LOCK, "utf8"), outputLock: readFileSync(OUTPUT_LOCK, "utf8") });
if (drift.length > 0) {
  const lines = drift.map((entry) => `  ${entry.name}: output ${entry.output.join(", ")} / workspace ${entry.workspace.join(", ")}`);
  fail(`the build output resolves ${drift.length} shared package(s) off the workspace lockfile:\n${lines.join("\n")}`);
}
process.stdout.write("[check-mastra-output] output pins match the workspace lockfile\n");

if (!process.argv.includes("--no-audit")) {
  const audit = pnpmIn("audit --prod --audit-level high");
  if (audit.status !== 0) fail(`pnpm audit --prod found high or critical advisories (exit ${String(audit.status)})`);
  process.stdout.write("[check-mastra-output] pnpm audit --prod: no high or critical advisory\n");
}
