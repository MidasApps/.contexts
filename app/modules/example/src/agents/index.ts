// Agent entry of the example module (`@core/module-example/agents`); only `apps/mastra` imports it.
export { createExampleAgentModule } from "./example-agent-module.ts";
export { createNoteIntakeWorkflow, type NoteIntakeResult, NoteIntakeResultSchema } from "./note-intake.workflow.ts";
export { exampleNotesSkill } from "./notes-skill.ts";
