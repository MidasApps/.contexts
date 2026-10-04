import type { CustomAgent, CustomAgentModel, CustomSkill } from "@core/contracts";
import { Agent } from "@mastra/core/agent";
import { createSkill, type InlineSkill } from "@mastra/core/skills";
import { loadInstructions } from "../agents/load-instructions.ts";
import { composeInstructions } from "../agents/prompt-instructions.ts";
import type { RequestContextReader } from "../context/agent-request-context.ts";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import type { AgentFactoryDeps } from "../runtime/agent-module.ts";
import type { CustomAgentLoader, LoadedCustomAgent } from "./custom-agent-loader.ts";
import { CUSTOM_AGENT_ID, type CustomToolsResolver } from "./custom-agent-tools.ts";

export const CUSTOM_INSTRUCTIONS = "custom.v1";
/** Like the supervisor: at most 8 steps per run. */
export const CUSTOM_AGENT_MAX_STEPS = 8;
/** An organization's skill reaches the model as `org-<name>`, so it cannot shadow a platform or module skill. */
export const CUSTOM_SKILL_PREFIX = "org-";

/** The run names no custom agent, or one that is missing, disabled or another tenant's. */
export class CustomAgentUnavailableError extends Error {
  readonly code = "CUSTOM_AGENT_UNAVAILABLE";

  constructor(options?: ErrorOptions) {
    super("custom agent unavailable", options);
    this.name = "CustomAgentUnavailableError";
  }
}

export const customSkillNameOf = (skill: Pick<CustomSkill, "name">): string => `${CUSTOM_SKILL_PREFIX}${skill.name}`;

/** The organization's part of the instructions; it goes inside the delimited addendum section. */
export const organizationSectionOf = (agent: Pick<CustomAgent, "name" | "description" | "instructions">): string =>
  [`Agent name: ${agent.name}`, `Purpose: ${agent.description}`, "", agent.instructions].join("\n");

/**
 * Instructions of a custom agent run: the platform preamble, then the organization's text as an
 * addendum that cannot end its section early (decision 0038's `composeInstructions`).
 */
export const customInstructionsOf = (seed: string, agent: CustomAgent): string =>
  composeInstructions({ seed, platform: null, addendum: { versionId: agent.id, body: organizationSectionOf(agent) } });

// A skill Mastra refuses (its own name or content rules) is left out; the agent still runs.
const inlineSkillOf = (skill: CustomSkill): InlineSkill[] => {
  try {
    return [
      createSkill({ name: customSkillNameOf(skill), description: skill.description, instructions: skill.instructions }),
    ];
  } catch {
    return [];
  }
};

/** Skills of a run: the selected platform skills that exist, then the organization's enabled ones. */
export const skillsOfRecord = (
  loaded: LoadedCustomAgent,
  coreSkills: Readonly<Record<string, InlineSkill>>,
): InlineSkill[] => [
  ...loaded.agent.coreSkills.flatMap((name) => coreSkills[name] ?? []),
  ...loaded.skills.flatMap(inlineSkillOf),
];

export type CustomAgentArgs = {
  readonly deps: Pick<AgentFactoryDeps, "models" | "guardrails" | "memory">;
  readonly loader: Pick<CustomAgentLoader, "ofRun">;
  readonly tools: CustomToolsResolver;
  /** Platform skills a record may select, by name. */
  readonly coreSkills: Readonly<Record<string, InlineSkill>>;
  readonly instructionsDirs?: readonly string[];
};

type Run = { readonly requestContext?: RequestContextReader };

/**
 * `custom-agent` (decision 0046): the one registered agent that runs every agent an organization
 * configured. Instructions, model, tools and skills are resolved per run from the record the
 * context names, in the tenant of the verified context; without an enabled record the run fails.
 * It owns the same tenant-scoped memory as the assistant and runs the `entry` guardrail profile,
 * because callers reach it directly (through `/chat/:agentId` only).
 */
export const createCustomAgent = (args: CustomAgentArgs): Agent => {
  const { deps, loader } = args;
  const seed = loadInstructions(CUSTOM_INSTRUCTIONS, args.instructionsDirs);
  const models: Record<CustomAgentModel, ReturnType<AgentFactoryDeps["models"]["language"]>> = {
    chat: deps.models.language("chat", { agentId: CUSTOM_AGENT_ID }),
    reasoning: deps.models.language("reasoning", { agentId: CUSTOM_AGENT_ID }),
  };
  const required = async ({ requestContext }: Run): Promise<LoadedCustomAgent> => {
    const loaded = await loader.ofRun(requestContext);
    if (loaded === null) throw new CustomAgentUnavailableError();
    return loaded;
  };
  return new Agent({
    id: CUSTOM_AGENT_ID,
    name: "Organization agent",
    description:
      "Runs an agent the organization configured: its instructions, model role, tools, skills and knowledge scope.",
    instructions: async (run: Run) => customInstructionsOf(seed, (await required(run)).agent),
    // Mastra also resolves the model outside a run (registration, the durable wrapper), so this
    // never throws: a run without a record still fails on its instructions and has no tools.
    model: async (run: Run) => models[(await loader.ofRun(run.requestContext))?.agent.model ?? "chat"],
    tools: async (run: Run) => {
      const loaded = await loader.ofRun(run.requestContext);
      return loaded === null ? {} : args.tools(loaded, run.requestContext);
    },
    skills: async (run: Run) => {
      const loaded = await loader.ofRun(run.requestContext);
      return loaded === null ? [] : skillsOfRecord(loaded, args.coreSkills);
    },
    ...(deps.memory === undefined ? {} : { memory: deps.memory }),
    defaultOptions: { maxSteps: CUSTOM_AGENT_MAX_STEPS },
    requestContextSchema: AgentRuntimeContextSchema,
    ...deps.guardrails("entry"),
  });
};
