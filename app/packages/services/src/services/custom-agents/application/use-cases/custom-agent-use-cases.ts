import { type CreateCustomAgentInput, type CustomAgent, type CustomAgentId, CustomAgentSchema, type CustomSkillId, type ErrorDetail, type UpdateCustomAgentInput } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { CustomAgentNotFoundError, CustomLimitReachedError, InvalidCustomDefinitionError } from "../../domain/custom-agent-errors.ts";
import {
  authorizeCustomAgents,
  changedFieldsOf,
  CUSTOM_AGENTS_READ_PERMISSION,
  CUSTOM_AGENTS_WRITE_PERMISSION,
  type CustomAgentsCommand,
  type CustomAgentsDeps,
  definedOf,
  instructionIssues,
  recordCustomAudit,
  schemaIssuesOf,
  type SelectableAgentOptions,
  selectionIssues,
} from "../custom-agents-deps.ts";

type AgentKey = { readonly agentId: CustomAgentId };
/** The runtime's offer, read by the route when the write selects tools or platform skills. */
type Selection = { readonly selectable?: SelectableAgentOptions | undefined };

export type CreateCustomAgentError = AccessDeniedError | CustomLimitReachedError | InvalidCustomDefinitionError;
export type CreateCustomAgent = (command: CustomAgentsCommand & Selection & { readonly input: CreateCustomAgentInput }) => Promise<Result<CustomAgent, CreateCustomAgentError>>;

export type GetCustomAgent = (command: Omit<CustomAgentsCommand, "requestId"> & AgentKey) => Promise<Result<CustomAgent, AccessDeniedError | CustomAgentNotFoundError>>;

export type UpdateCustomAgentError = AccessDeniedError | CustomAgentNotFoundError | InvalidCustomDefinitionError;
export type UpdateCustomAgent = (command: CustomAgentsCommand & AgentKey & Selection & { readonly input: UpdateCustomAgentInput }) => Promise<Result<CustomAgent, UpdateCustomAgentError>>;

export type DeleteCustomAgent = (command: CustomAgentsCommand & AgentKey) => Promise<Result<void, AccessDeniedError | CustomAgentNotFoundError>>;

// Every selected skill must be a skill of the same organization (another tenant's reads as missing).
const unknownSkillIssues = async (deps: Pick<CustomAgentsDeps, "skills">, tx: Transaction, command: CustomAgentsCommand, skillIds: readonly CustomSkillId[] | undefined): Promise<ErrorDetail[]> => {
  if (skillIds === undefined || skillIds.length === 0) return [];
  const found = await Promise.all(skillIds.map((skillId) => deps.skills.get(tx, { tenantId: command.tenantId, skillId })));
  return found.flatMap((skill, index) => (skill === null ? [{ field: `customSkills.${String(index)}`, issue: "NOT_FOUND" }] : []));
};

/**
 * Creates an agent of the organization (`core.agent-settings.update`): the plan caps how many
 * and how long their instructions are; audited as `CUSTOM_AGENT_CREATED`. The count is read
 * before the write, not in its transaction (decision 0046 §12). Selected tools and skills must
 * exist: every unknown one is named in the refusal (decision 0046 amendment A1).
 */
export const makeCreateCustomAgent =
  (deps: CustomAgentsDeps): CreateCustomAgent =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const limits = await deps.limits(command.tenantId);
    const tooLong = instructionIssues(command.input.instructions, limits.maxInstructionChars);
    if (tooLong.length > 0) return err(new InvalidCustomDefinitionError(tooLong));
    if ((await deps.agents.count({ tenantId: command.tenantId })) >= limits.maxAgents) return err(new CustomLimitReachedError("agents", limits.maxAgents));
    const now = deps.clock.now().toISOString();
    const agent = CustomAgentSchema.parse({
      model: "chat",
      tools: [],
      connectorTools: false,
      coreSkills: [],
      customSkills: [],
      knowledgeScope: "none",
      enabled: true,
      ...definedOf(command.input),
      id: deps.agents.newId(),
      tenantId: command.tenantId,
      createdBy: auditActorOf(command.actor).id,
      createdAt: now,
      updatedAt: now,
    });
    return deps.unitOfWork.run(async (tx): Promise<Result<CustomAgent, CreateCustomAgentError>> => {
      const unknown = [...selectionIssues(agent, command.selectable), ...(await unknownSkillIssues(deps, tx, command, agent.customSkills))];
      if (unknown.length > 0) return err(new InvalidCustomDefinitionError(unknown));
      deps.agents.create(tx, { agent });
      await recordCustomAudit(deps, command, { action: "CUSTOM_AGENT_CREATED", target: { type: "custom-agent", id: agent.id } }, tx);
      return ok(agent);
    });
  };

/** Reads one agent of the organization (`core.agent-settings.read`); another tenant's answers not found. */
export const makeGetCustomAgent =
  (deps: Pick<CustomAgentsDeps, "agents">): GetCustomAgent =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_READ_PERMISSION);
    if (!allowed.ok) return allowed;
    const agent = await deps.agents.get(undefined, { tenantId: command.tenantId, agentId: command.agentId });
    return agent === null ? err(new CustomAgentNotFoundError()) : ok(agent);
  };

/** Changes an agent (`core.agent-settings.update`); audited as `CUSTOM_AGENT_UPDATED` with the changed field names. */
export const makeUpdateCustomAgent =
  (deps: CustomAgentsDeps): UpdateCustomAgent =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const limits = await deps.limits(command.tenantId);
    const tooLong = instructionIssues(command.input.instructions, limits.maxInstructionChars);
    if (tooLong.length > 0) return err(new InvalidCustomDefinitionError(tooLong));
    const now = deps.clock.now().toISOString();
    return deps.unitOfWork.run(async (tx): Promise<Result<CustomAgent, UpdateCustomAgentError>> => {
      const current = await deps.agents.get(tx, { tenantId: command.tenantId, agentId: command.agentId });
      if (current === null) return err(new CustomAgentNotFoundError());
      const parsed = CustomAgentSchema.safeParse({ ...current, ...definedOf(command.input), updatedAt: now });
      if (!parsed.success) return err(new InvalidCustomDefinitionError(schemaIssuesOf(parsed.error)));
      const unknown = [...selectionIssues(command.input, command.selectable), ...(await unknownSkillIssues(deps, tx, command, command.input.customSkills))];
      if (unknown.length > 0) return err(new InvalidCustomDefinitionError(unknown));
      deps.agents.replace(tx, { agent: parsed.data, actorId: auditActorOf(command.actor).id });
      await recordCustomAudit(deps, command, { action: "CUSTOM_AGENT_UPDATED", target: { type: "custom-agent", id: current.id }, changes: changedFieldsOf(command.input) }, tx);
      return ok(parsed.data);
    });
  };

/** Deletes an agent (`core.agent-settings.update`); audited as `CUSTOM_AGENT_DELETED`. Its conversations stay readable. */
export const makeDeleteCustomAgent =
  (deps: CustomAgentsDeps): DeleteCustomAgent =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    return deps.unitOfWork.run(async (tx): Promise<Result<void, CustomAgentNotFoundError>> => {
      const current = await deps.agents.get(tx, { tenantId: command.tenantId, agentId: command.agentId });
      if (current === null) return err(new CustomAgentNotFoundError());
      deps.agents.delete(tx, { agentId: current.id });
      await recordCustomAudit(deps, command, { action: "CUSTOM_AGENT_DELETED", target: { type: "custom-agent", id: current.id } }, tx);
      return ok(undefined);
    });
  };
