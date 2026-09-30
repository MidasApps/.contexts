// Runs before `mastra build`: copies the versioned agent instructions of @core/agents
// (packages/agents/src/agents/instructions/*.md) into src/mastra/public/instructions and
// the core Agent Skills (packages/agents/skills/<name>/SKILL.md) into src/mastra/public/skills.
// `mastra build` inlines the agent code into .mastra/output and copies `public/` next to
// it, so `loadInstructions` (`<bundle dir>/instructions`) and `loadSkill` (`<bundle dir>/skills`)
// find them there. The copies are generated (gitignored); the package folders stay the source of truth.
import { cpSync, rmSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(import.meta.dirname, "..");
const ASSETS = [
  { source: "../../packages/agents/src/agents/instructions", target: "src/mastra/public/instructions" },
  { source: "../../packages/agents/skills", target: "src/mastra/public/skills" },
];

for (const asset of ASSETS) {
  const source = path.resolve(APP_DIR, asset.source);
  const target = path.join(APP_DIR, asset.target);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  process.stdout.write(`[copy-agent-assets] ${path.relative(APP_DIR, source)} -> ${path.relative(APP_DIR, target)}\n`);
}
