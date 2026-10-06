// Runs before `mastra build` (and `mastra dev`): copies the package files the agents read at runtime
// (`AGENT_ASSETS`: the versioned instructions, the core Agent Skills and the eval datasets and
// baselines) into src/mastra/public. `mastra build` inlines the agent code into .mastra/output and
// copies `public/` next to it, so `loadInstructions` (`<bundle dir>/instructions`), `loadSkill`
// (`<bundle dir>/skills`) and `EVALS_DIR` (`<bundle dir>/evals`) find them there.
// `check-mastra-output.ts` fails the build when a copied file is missing from the output.
// The copies are generated (gitignored); the package folders stay the source of truth.
import { cpSync, rmSync } from "node:fs";
import path from "node:path";
import { AGENT_ASSETS } from "../src/build/agent-assets.ts";

const APP_DIR = path.resolve(import.meta.dirname, "..");

for (const asset of AGENT_ASSETS) {
  const source = path.resolve(APP_DIR, asset.source);
  const target = path.join(APP_DIR, asset.target);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  process.stdout.write(`[copy-agent-assets] ${path.relative(APP_DIR, source)} -> ${path.relative(APP_DIR, target)}\n`);
}
