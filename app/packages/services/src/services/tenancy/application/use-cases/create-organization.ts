import type { CreateOrganizationInput, Organization, Project, UserPrincipal } from "@core/contracts";
import { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import {
  organizationNode,
  projectNode,
  recordTenancyAudit,
  type TenancyCommand,
  type TenancyDeps,
} from "../tenancy-deps.ts";

export type CreateOrganizationCommand = TenancyCommand & {
  readonly actor: UserPrincipal;
  readonly input: CreateOrganizationInput;
};

export type CreateOrganization = (
  command: CreateOrganizationCommand,
) => Promise<Result<Organization, AccessDeniedError>>;

/** Bug guard: the verified caller has no Firebase Auth account with an email. */
export class UserAccountMissingError extends Error {
  readonly code = "USER_ACCOUNT_MISSING";

  constructor() {
    super("the caller has no Auth account with an email; users/{uid} cannot be created");
    this.name = "UserAccountMissingError";
  }
}

/** Who may create organizations: the caller and its request scope. */
export type OrganizationCreationCheck = Pick<TenancyCommand, "access"> & { readonly actor: UserPrincipal };

/** `true` when `createOrganization` would let the caller in (`GET /v1/me` capability, decision 0050). */
export type MayCreateOrganization = (command: OrganizationCreationCheck) => Promise<boolean>;

// Impersonation is read-only; self-serve off: only staff with platform.organization.read (SP1 spec §6.1).
const mayCreate = async (
  deps: TenancyDeps,
  command: OrganizationCreationCheck,
): Promise<Result<void, AccessDeniedError>> => {
  if (command.actor.impersonation !== undefined) return err(new AccessDeniedError("IMPERSONATION_READ_ONLY"));
  if (deps.selfServe) return ok(undefined);
  const decision = await command.access.authorize({
    principal: command.actor,
    permission: "platform.organization.read",
    node: { level: "platform" },
  });
  return decision.allowed
    ? ok(undefined)
    : err(new AccessDeniedError(decision.reason === "NOT_A_MEMBER" ? "PERMISSION_NOT_GRANTED" : decision.reason));
};

/** The creation rule as a yes/no, so the client hides a form that would always be refused. */
export const makeMayCreateOrganization =
  (deps: TenancyDeps): MayCreateOrganization =>
  async (command) =>
    (await mayCreate(deps, command)).ok;

/**
 * Creates an organization with the caller as owner (SP1 spec §6.1). One transaction
 * writes the organization, the owner membership, the access projection, the caller's
 * `users` doc (created when missing, so `authorize()` sees an active user; the new
 * organization becomes active when none is) and both audit entries; claims sync after.
 * With the default project on (decision 0078), the same transaction also writes the organization's
 * one project, named after it, and its audit entry.
 * @throws {UserAccountMissingError} when the Auth account has no email (bug).
 */
export const makeCreateOrganization =
  (deps: TenancyDeps): CreateOrganization =>
  async (command) => {
    const allowed = await mayCreate(deps, command);
    if (!allowed.ok) return allowed;
    const profile = await deps.accounts.getProfile(command.actor.uid);
    if (profile === null) throw new UserAccountMissingError();
    const tenantId = deps.organizations.newId();
    const now = deps.clock.now().toISOString();
    const organization: Organization = {
      id: tenantId,
      tenantId,
      name: command.input.name,
      status: "active",
      defaults: { ...command.input.defaults },
      createdAt: now,
      updatedAt: now,
    };
    const node = organizationNode(tenantId);
    const actor = auditActorOf(command.actor);
    // Built before the transaction function: a retried attempt writes the same project, not a second one.
    const project: Project | null = deps.defaultProject
      ? {
          id: deps.projects.newId(),
          tenantId,
          name: organization.name,
          status: "active",
          settings: {},
          createdAt: now,
          updatedAt: now,
        }
      : null;
    await deps.unitOfWork.run(async (tx) => {
      const plan = await deps.access.prepareGrant(tx, {
        tenantId,
        principal: { type: "user", id: command.actor.uid },
        node,
        roles: [{ kind: "system", key: "owner" }],
        grantedBy: command.actor.uid,
        actor,
        requestId: command.requestId,
        newUser: profile,
        organizationCreated: true,
      });
      // A fresh organization has no grant yet; a clash here is a bug.
      if (!plan.ok) throw plan.error;
      deps.organizations.create(tx, { organization, actorId: actor.id });
      await plan.data.commit();
      await recordTenancyAudit(tx, deps, command, {
        tenantId,
        action: "ORGANIZATION_CREATED",
        target: { type: "organization", id: tenantId },
        node,
      });
      if (project !== null) {
        deps.projects.create(tx, { project, actorId: actor.id });
        await recordTenancyAudit(tx, deps, command, {
          tenantId,
          action: "PROJECT_CREATED",
          target: { type: "project", id: project.id },
          node: projectNode(project),
        });
      }
    });
    await deps.access.syncClaims(command.actor.uid);
    return ok(organization);
  };
