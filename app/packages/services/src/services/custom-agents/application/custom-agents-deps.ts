import type { AuditAction, ErrorDetail, Principal, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { RequestAccess } from "../../access/composition.ts";
import { requirePermission } from "../../access/application/grant-checks.ts";
import type { AccessDeniedError } from "../../access/domain/errors/access-denied-error.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import { auditActorOf } from "../../audit/domain/audit-actor.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { Result } from "../../shared/result/result.ts";
import type { CustomAgentRepository, CustomLimitsReader, CustomSkillRepository } from "./ports/custom-agent-ports.ts";

export const CUSTOM_AGENTS_READ_PERMISSION = "core.agent-settings.read";
export const CUSTOM_AGENTS_WRITE_PERMISSION = "core.agent-settings.update";
export const CHAT_USE_PERMISSION = "core.chat.use";

/** Dependencies of the custom agents use cases (`createCustomAgentsServices`). */
export type CustomAgentsDeps = {
  readonly agents: CustomAgentRepository;
  readonly skills: CustomSkillRepository;
  readonly limits: CustomLimitsReader;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
};

/** Who asks, with this request's access scope, in which organization. */
export type CustomAgentsCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly requestId: string;
};

type CustomPermission = typeof CUSTOM_AGENTS_READ_PERMISSION | typeof CUSTOM_AGENTS_WRITE_PERMISSION | typeof CHAT_USE_PERMISSION;

/** Authorizes a permission at the organization (fail-closed). */
export const authorizeCustomAgents = (command: Pick<CustomAgentsCommand, "actor" | "access" | "tenantId">, permission: CustomPermission): Promise<Result<void, AccessDeniedError>> =>
  requirePermission({ access: command.access, actor: command.actor, permission, node: { level: "organization", tenantId: command.tenantId } });

/** One audit entry per change; field names only in `changes`, never the instructions. */
export const recordCustomAudit = async (
  deps: Pick<CustomAgentsDeps, "audit">,
  command: CustomAgentsCommand,
  fact: { readonly action: AuditAction; readonly target: { readonly type: "custom-agent" | "custom-skill"; readonly id: string }; readonly changes?: readonly string[] },
  tx?: Transaction,
): Promise<void> => {
  await deps.audit.record(
    {
      log: "tenant",
      tenantId: command.tenantId,
      action: fact.action,
      actor: auditActorOf(command.actor),
      target: fact.target,
      node: { level: "organization", tenantId: command.tenantId },
      outcome: "success",
      requestId: command.requestId,
      ...(fact.changes === undefined ? {} : { changes: [...fact.changes] }),
    },
    tx,
  );
};

/** Names of the fields a patch sets, sorted (the audit `changes`). */
export const changedFieldsOf = (input: Readonly<Record<string, unknown>>): string[] =>
  Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .toSorted();

/** The plan's instruction cap (the schema only knows the hard cap). */
export const instructionIssues = (instructions: string | undefined, maxChars: number): ErrorDetail[] =>
  instructions !== undefined && instructions.length > maxChars ? [{ field: "instructions", issue: "TOO_BIG" }] : [];

export const schemaIssuesOf = (error: { readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly code: string }[] }): ErrorDetail[] =>
  error.issues.map((issue) => ({ field: issue.path.map(String).join(".") || "(body)", issue: issue.code.toUpperCase() }));

/** A patch without its absent fields (`exactOptionalPropertyTypes`: undefined must not overwrite). */
export const definedOf = <T extends Readonly<Record<string, unknown>>>(input: T): Partial<T> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
