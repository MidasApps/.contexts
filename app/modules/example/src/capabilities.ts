import type { CapabilityKind, CapabilityRef } from "@core/contracts";

/** Agent Skill of the module (`src/agents/notes-skill.ts`). */
export const EXAMPLE_NOTES_SKILL_ID = "example-notes";
/** Workflow of the module (`src/agents/note-intake.workflow.ts`). */
export const EXAMPLE_NOTE_INTAKE_WORKFLOW_ID = "example-note-intake";

/**
 * Agents, tools, workflows and skills the example module implements (umbrella D6, decision 0019).
 * Every ref has its implementation in `src/agents/example-agent-module.ts`: a ref without one (or an
 * implementation without a ref) is a boot error of the agent runtime. `agents` and `tools` stay
 * empty: the module's agent tools are its command contracts (`example.CreateNoteCommand`,
 * `example.ArchiveNoteCommand`), which the runtime derives from the command registry (decision 0025).
 * Ids take the module prefix: `example-<name>` (agents, skills, workflows) or `example.<name>` (tools).
 */
export const EXAMPLE_CAPABILITIES: Readonly<Record<CapabilityKind, CapabilityRef[]>> = {
  agents: [],
  tools: [],
  workflows: [{ id: EXAMPLE_NOTE_INTAKE_WORKFLOW_ID }],
  skills: [{ id: EXAMPLE_NOTES_SKILL_ID }],
};
