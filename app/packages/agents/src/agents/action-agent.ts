import { Agent } from "@mastra/core/agent";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import type { AgentDefinition } from "../runtime/agent-module.ts";
import { CORE_SKILLS } from "../skills/resolve-skills.ts";
import type { AgentCommand } from "../tools/commands/agent-command.ts";
import { SUBAGENT_MAX_STEPS } from "./data-agent.ts";
import { loadInstructions } from "./load-instructions.ts";

export const ACTION_AGENT_ID = "action";
export const ACTION_INSTRUCTIONS = "action.v1";

/** Ceiling of the action agent: the union of the permissions its commands declare. */
export const actionCeilingOf = (commands: readonly AgentCommand[]): string[] => ["core.chat.use", ...new Set(commands.map(({ tool }) => tool.permission))];

/**
 * `action` subagent (spec §6, §8.4): runs command tools (`command.<contractId>`) after the
 * user confirmed them. Every command is a mutation, so Mastra asks the user to approve each
 * call (`tool-call-approval`); four-eyes permissions become SP1 approval requests. Runs on
 * the `reasoning` role with the `delegated` guardrail profile.
 */
export const createActionAgentDefinition = (options: {
  readonly commands: readonly AgentCommand[];
  readonly instructionsDirs?: readonly string[];
}): AgentDefinition => ({
  id: ACTION_AGENT_ID,
  role: "subagent",
  ceiling: actionCeilingOf(options.commands),
  create: ({ models, tools, guardrails, skills, connectorTools, instructions }) =>
    new Agent({
      id: ACTION_AGENT_ID,
      name: "Action",
      description: "Runs a command that creates or changes the organization's data after the user confirmed it; every command asks the user for approval first.",
      instructions: instructions(ACTION_AGENT_ID, loadInstructions(ACTION_INSTRUCTIONS, options.instructionsDirs)),
      model: models.language("reasoning", { agentId: ACTION_AGENT_ID }),
      tools: async ({ requestContext }) => ({
        ...tools.toMastraTools(options.commands.map(({ tool }) => tool.id)),
        ...(await connectorTools(requestContext, "action")),
      }),
      skills: skills([CORE_SKILLS.safeActions]),
      defaultOptions: { maxSteps: SUBAGENT_MAX_STEPS },
      requestContextSchema: AgentRuntimeContextSchema,
      ...guardrails("delegated"),
    }),
});
