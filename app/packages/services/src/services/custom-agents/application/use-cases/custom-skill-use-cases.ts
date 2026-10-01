import { type CreateCustomSkillInput, type CustomSkill, type CustomSkillId, CustomSkillSchema, type UpdateCustomSkillInput } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { CustomLimitReachedError, CustomSkillNameTakenError, CustomSkillNotFoundError, InvalidCustomDefinitionError } from "../../domain/custom-agent-errors.ts";
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
} from "../custom-agents-deps.ts";

type SkillKey = { readonly skillId: CustomSkillId };
type ReadCommand = Omit<CustomAgentsCommand, "requestId">;

export type ListCustomSkills = (command: ReadCommand & { readonly page: PageRequest }) => Promise<Result<Page<CustomSkill>, AccessDeniedError>>;
export type GetCustomSkill = (command: ReadCommand & SkillKey) => Promise<Result<CustomSkill, AccessDeniedError | CustomSkillNotFoundError>>;

export type CreateCustomSkillError = AccessDeniedError | CustomLimitReachedError | CustomSkillNameTakenError | InvalidCustomDefinitionError;
export type CreateCustomSkill = (command: CustomAgentsCommand & { readonly input: CreateCustomSkillInput }) => Promise<Result<CustomSkill, CreateCustomSkillError>>;

export type UpdateCustomSkillError = AccessDeniedError | CustomSkillNotFoundError | CustomSkillNameTakenError | InvalidCustomDefinitionError;
export type UpdateCustomSkill = (command: CustomAgentsCommand & SkillKey & { readonly input: UpdateCustomSkillInput }) => Promise<Result<CustomSkill, UpdateCustomSkillError>>;

export type DeleteCustomSkill = (command: CustomAgentsCommand & SkillKey) => Promise<Result<void, AccessDeniedError | CustomSkillNotFoundError>>;

/** Lists the organization's own skills, newest first (`core.agent-settings.read`). */
export const makeListCustomSkills =
  (deps: Pick<CustomAgentsDeps, "skills">): ListCustomSkills =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_READ_PERMISSION);
    if (!allowed.ok) return allowed;
    return ok(await deps.skills.list({ tenantId: command.tenantId, page: command.page }));
  };

/** Reads one skill of the organization (`core.agent-settings.read`); another tenant's answers not found. */
export const makeGetCustomSkill =
  (deps: Pick<CustomAgentsDeps, "skills">): GetCustomSkill =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_READ_PERMISSION);
    if (!allowed.ok) return allowed;
    const skill = await deps.skills.get(undefined, { tenantId: command.tenantId, skillId: command.skillId });
    return skill === null ? err(new CustomSkillNotFoundError()) : ok(skill);
  };

/**
 * Creates a skill (`core.agent-settings.update`): unique name in the organization, plan caps on
 * the count and the instruction length; audited as `CUSTOM_SKILL_CREATED`.
 */
export const makeCreateCustomSkill =
  (deps: CustomAgentsDeps): CreateCustomSkill =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const limits = await deps.limits(command.tenantId);
    const tooLong = instructionIssues(command.input.instructions, limits.maxInstructionChars);
    if (tooLong.length > 0) return err(new InvalidCustomDefinitionError(tooLong));
    if ((await deps.skills.count({ tenantId: command.tenantId })) >= limits.maxSkills) return err(new CustomLimitReachedError("skills", limits.maxSkills));
    const now = deps.clock.now().toISOString();
    const skill = CustomSkillSchema.parse({
      enabled: true,
      ...definedOf(command.input),
      id: deps.skills.newId(),
      tenantId: command.tenantId,
      createdBy: auditActorOf(command.actor).id,
      createdAt: now,
      updatedAt: now,
    });
    return deps.unitOfWork.run(async (tx): Promise<Result<CustomSkill, CreateCustomSkillError>> => {
      if ((await deps.skills.findByName(tx, { tenantId: command.tenantId, name: skill.name })) !== null) return err(new CustomSkillNameTakenError());
      deps.skills.create(tx, { skill });
      await recordCustomAudit(deps, command, { action: "CUSTOM_SKILL_CREATED", target: { type: "custom-skill", id: skill.id } }, tx);
      return ok(skill);
    });
  };

/** Changes a skill (`core.agent-settings.update`); audited as `CUSTOM_SKILL_UPDATED` with the changed field names. */
export const makeUpdateCustomSkill =
  (deps: CustomAgentsDeps): UpdateCustomSkill =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const limits = await deps.limits(command.tenantId);
    const tooLong = instructionIssues(command.input.instructions, limits.maxInstructionChars);
    if (tooLong.length > 0) return err(new InvalidCustomDefinitionError(tooLong));
    const now = deps.clock.now().toISOString();
    return deps.unitOfWork.run(async (tx): Promise<Result<CustomSkill, UpdateCustomSkillError>> => {
      const current = await deps.skills.get(tx, { tenantId: command.tenantId, skillId: command.skillId });
      if (current === null) return err(new CustomSkillNotFoundError());
      const parsed = CustomSkillSchema.safeParse({ ...current, ...definedOf(command.input), updatedAt: now });
      if (!parsed.success) return err(new InvalidCustomDefinitionError(schemaIssuesOf(parsed.error)));
      if (parsed.data.name !== current.name) {
        const holder = await deps.skills.findByName(tx, { tenantId: command.tenantId, name: parsed.data.name });
        if (holder !== null && holder.id !== current.id) return err(new CustomSkillNameTakenError());
      }
      deps.skills.replace(tx, { skill: parsed.data, actorId: auditActorOf(command.actor).id });
      await recordCustomAudit(deps, command, { action: "CUSTOM_SKILL_UPDATED", target: { type: "custom-skill", id: current.id }, changes: changedFieldsOf(command.input) }, tx);
      return ok(parsed.data);
    });
  };

/**
 * Deletes a skill (`core.agent-settings.update`); audited as `CUSTOM_SKILL_DELETED`. Agents that
 * selected it keep its id and run without it (decision 0046).
 */
export const makeDeleteCustomSkill =
  (deps: CustomAgentsDeps): DeleteCustomSkill =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    return deps.unitOfWork.run(async (tx): Promise<Result<void, CustomSkillNotFoundError>> => {
      const current = await deps.skills.get(tx, { tenantId: command.tenantId, skillId: command.skillId });
      if (current === null) return err(new CustomSkillNotFoundError());
      deps.skills.delete(tx, { skillId: current.id });
      await recordCustomAudit(deps, command, { action: "CUSTOM_SKILL_DELETED", target: { type: "custom-skill", id: current.id } }, tx);
      return ok(undefined);
    });
  };
