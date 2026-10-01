import {
  CreateCustomAgentInputSchema,
  type CreateCustomAgentInput,
  type CustomAgent,
  type CustomAgentKnowledgeScope,
  type CustomAgentModel,
  type ErrorDetail,
} from "@core/contracts";

/** The agent form as the user fills it; nothing is trusted yet. */
export type AgentDraft = {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly model: CustomAgentModel;
  readonly tools: readonly string[];
  readonly connectorTools: boolean;
  readonly coreSkills: readonly string[];
  readonly customSkills: readonly string[];
  readonly knowledgeScope: CustomAgentKnowledgeScope;
  readonly enabled: boolean;
};

export const AGENT_DRAFT_FIELDS = ["name", "description", "instructions", "model", "tools", "coreSkills", "customSkills", "knowledgeScope"] as const;
export type AgentDraftField = (typeof AGENT_DRAFT_FIELDS)[number];
/** `invalid`: the field breaks its rule; `tooLong`: the instructions pass the plan's cap. */
export type AgentProblem = "invalid" | "tooLong";
export type AgentDraftProblems = Partial<Record<AgentDraftField, AgentProblem>>;

export const emptyAgentDraft = (): AgentDraft => ({
  name: "",
  description: "",
  instructions: "",
  model: "chat",
  tools: [],
  connectorTools: false,
  coreSkills: [],
  customSkills: [],
  knowledgeScope: "none",
  enabled: true,
});

export const draftFromAgent = (agent: CustomAgent): AgentDraft => ({
  name: agent.name,
  description: agent.description,
  instructions: agent.instructions,
  model: agent.model,
  tools: agent.tools,
  connectorTools: agent.connectorTools,
  coreSkills: agent.coreSkills,
  customSkills: agent.customSkills,
  knowledgeScope: agent.knowledgeScope,
  enabled: agent.enabled,
});

/** Adds or removes one value of a multi-select, keeping the order of selection. */
export const toggleItem = (items: readonly string[], item: string, selected: boolean): string[] =>
  selected ? [...items.filter((value) => value !== item), item] : items.filter((value) => value !== item);

const fieldOf = (path: string): AgentDraftField | undefined => AGENT_DRAFT_FIELDS.find((field) => field === path.split(".")[0]);

/** Problems the API reported (`VALIDATION_FAILED` details), mapped to form fields. */
export const agentProblemsFromDetails = (details: readonly ErrorDetail[] | undefined): AgentDraftProblems => {
  const problems: AgentDraftProblems = {};
  for (const detail of details ?? []) {
    const field = fieldOf(detail.field);
    if (field !== undefined) problems[field] = field === "instructions" && detail.issue === "TOO_BIG" ? "tooLong" : "invalid";
  }
  return problems;
};

export type AgentDraftResult = { readonly ok: true; readonly input: CreateCustomAgentInput } | { readonly ok: false; readonly problems: AgentDraftProblems };

/**
 * Builds the wire input and checks it with the contract schema and the plan's instruction cap, for
 * early feedback only: the API validates again and the runtime ignores tools it does not have.
 */
export const agentInputOf = (draft: AgentDraft, maxInstructionChars: number): AgentDraftResult => {
  const parsed = CreateCustomAgentInputSchema.safeParse({ ...draft, name: draft.name.trim() });
  const problems: AgentDraftProblems = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldOf(issue.path.map(String).join("."));
      if (field !== undefined) problems[field] = "invalid";
    }
  }
  if (draft.instructions.length > maxInstructionChars) problems.instructions = "tooLong";
  return parsed.success && Object.keys(problems).length === 0 ? { ok: true, input: parsed.data } : { ok: false, problems };
};
