import { type AgentModule, type AgentRuntimePorts, defineAgentModule } from "@core/agents";
import { exampleManifest } from "../manifest.ts";
import { createNoteIntakeWorkflow } from "./note-intake.workflow.ts";
import { exampleNotesSkill } from "./notes-skill.ts";

/**
 * The example module's agent capabilities (decision 0019): the implementations of the skill and
 * the workflow its manifest names. The module's commands are not listed here: they are entries
 * of the command registry (`createExampleCommands`, `@core/module-example/server`), and the
 * runtime derives the action agent's tools `command.example.*` from that registry (decision 0025).
 * @throws {AgentModuleError} when a manifest ref has no implementation, or the reverse (boot error).
 */
export const createExampleAgentModule = (deps: { readonly ports: Pick<AgentRuntimePorts, "workflowCommands"> }): AgentModule =>
  defineAgentModule({
    id: exampleManifest.id,
    manifest: exampleManifest,
    skills: [exampleNotesSkill],
    workflows: [{ workflow: createNoteIntakeWorkflow({ commands: deps.ports.workflowCommands }), startable: true }],
  });
