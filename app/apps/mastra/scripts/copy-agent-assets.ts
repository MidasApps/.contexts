// Runs before `mastra build`: copies the versioned agent instructions of @core/agents
// (packages/agents/src/agents/instructions/*.md) into src/mastra/public/instructions.
// `mastra build` inlines the agent code into .mastra/output and copies `public/` next to
// it, so `loadInstructions` (which reads `<bundle dir>/instructions`) finds them there.
// The copy is generated (gitignored); the package folder stays the source of truth.
import { cpSync, rmSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(import.meta.dirname, "..");
const SOURCE = path.resolve(APP_DIR, "../../packages/agents/src/agents/instructions");
const TARGET = path.join(APP_DIR, "src/mastra/public/instructions");

rmSync(TARGET, { recursive: true, force: true });
cpSync(SOURCE, TARGET, { recursive: true });
process.stdout.write(`[copy-agent-assets] ${path.relative(APP_DIR, SOURCE)} -> ${path.relative(APP_DIR, TARGET)}\n`);
