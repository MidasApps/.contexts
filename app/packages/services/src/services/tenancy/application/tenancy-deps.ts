import type { AuditLogEntry, Principal, Project, TenantId, TenantNodeRef, Unit } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { AccessServices, RequestAccess } from "../../access/composition.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import { auditActorOf } from "../../audit/domain/audit-actor.ts";
import type { UserAccountReader } from "../../identity/application/ports/driven/user-account-reader.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { UnitTypeRegistry } from "../domain/unit-type-registry.ts";
import type { OrganizationRepository } from "./ports/driven/organization-repository.ts";
import type { ProjectRepository } from "./ports/driven/project-repository.ts";
import type { UnitRepository } from "./ports/driven/unit-repository.ts";
import type { UnitTreeLockStore } from "./ports/driven/unit-tree-lock-store.ts";

/** Dependencies of the tenancy use cases, built by `createTenancyServices`. */
export type TenancyDeps = {
  readonly organizations: OrganizationRepository;
  readonly projects: ProjectRepository;
  readonly units: UnitRepository;
  /** One tree change (move, delete) at a time per project (decision 0030 §4). */
  readonly treeLocks: UnitTreeLockStore;
  readonly unitTypes: UnitTypeRegistry;
  /** The owner grant of a new organization, claims sync, and the projection read model. */
  readonly access: Pick<AccessServices, "prepareGrant" | "syncClaims" | "projections">;
  readonly accounts: UserAccountReader;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  /** `ORGANIZATION_SELF_SERVE`: any user may create organizations (SP1 spec §6.1). */
  readonly selfServe: boolean;
};

/** What every tenancy command carries: the caller, its request scope and the request id. */
export type TenancyCommand = { readonly actor: Principal; readonly access: RequestAccess; readonly requestId: string };

export const organizationNode = (tenantId: TenantId): TenantNodeRef => ({ level: "organization", tenantId });

export const projectNode = (project: Pick<Project, "tenantId" | "id">): TenantNodeRef => ({
  level: "project",
  tenantId: project.tenantId,
  projectId: project.id,
});

export const unitNode = (unit: Pick<Unit, "tenantId" | "projectId" | "id">): TenantNodeRef => ({
  level: "unit",
  tenantId: unit.tenantId,
  projectId: unit.projectId,
  unitId: unit.id,
});

/** Whose access projection lists the caller's visible nodes: the user, the device, or the API key's owner. */
export const projectionPrincipalIdOf = (principal: Principal): string =>
  principal.type === "user" ? principal.uid : principal.type === "device" ? principal.deviceId : principal.ownerUid;

type AuditFact = {
  readonly tenantId: TenantId;
  readonly action: AuditLogEntry["action"];
  readonly target: AuditLogEntry["target"];
  readonly node: TenantNodeRef;
  readonly changes?: readonly string[] | undefined;
};

/** Appends a tenant audit entry for a tenancy change inside `tx`. */
export const recordTenancyAudit = async (tx: Transaction, deps: Pick<TenancyDeps, "audit">, command: TenancyCommand, fact: AuditFact): Promise<void> => {
  await deps.audit.record(
    {
      log: "tenant",
      tenantId: fact.tenantId,
      action: fact.action,
      actor: auditActorOf(command.actor),
      target: fact.target,
      node: fact.node,
      outcome: "success",
      requestId: command.requestId,
      ...(fact.changes === undefined ? {} : { changes: [...fact.changes] }),
    },
    tx,
  );
};

/** Names of the keys a patch sets (audit `changes`), nested objects as dotted paths. */
export const changedKeys = (patch: Readonly<Record<string, unknown>>): string[] =>
  Object.entries(patch).flatMap(([key, value]) => {
    if (value === undefined) return [];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return Object.keys(value).map((inner) => `${key}.${inner}`);
    }
    return [key];
  });
