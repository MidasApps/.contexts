import {
  accessProjectionId,
  UserIdSchema,
  type AccessProjection,
  type Membership,
  type RoleRef,
  type TenantId,
  type TenantNodeRef,
  type UserId,
} from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { AuditActor } from "../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import { buildAccessProjection, nodeIdOf, type ProjectionPrincipal } from "../domain/access-projection.ts";
import { AccessNotFoundError } from "../domain/errors/access-not-found-error.ts";
import { MembershipExistsError } from "../domain/errors/membership-exists-error.ts";
import type { AccessWriteDeps } from "./access-write-deps.ts";
import type { NewUserProfile, UserAccessState } from "./ports/driven/user-access-version.ts";

/** Everything a grant change must read before writing (Firestore: reads first). */
export type PrincipalState = {
  readonly live: readonly Membership[];
  readonly projection: AccessProjection | null;
  /** The `users` doc state; always null for devices. */
  readonly user: UserAccessState | null;
  /** The organization exists and is not deleted (read in the same transaction). */
  readonly tenantLive: boolean;
};

type Deps = Pick<AccessWriteDeps, "memberships" | "projections" | "users" | "tenantGuard" | "audit" | "clock">;

type PrincipalRef = { readonly tenantId: TenantId; readonly principal: ProjectionPrincipal };

/**
 * Reads the principal's live grants, projection and user doc, and whether the organization
 * still exists, inside `tx`. `tenantCreated` skips the organization read when the
 * organization is created in this very transaction.
 */
export const readPrincipalState = async (tx: Transaction, deps: Deps, args: PrincipalRef & { readonly tenantCreated?: boolean }): Promise<PrincipalState> => {
  const { tenantId, principal } = args;
  const [live, projection, user, tenantLive] = await Promise.all([
    deps.memberships.listOfPrincipal(tx, { tenantId, principalId: principal.id }),
    deps.projections.get(tx, { tenantId, principalId: principal.id }),
    principal.type === "user" ? deps.users.read(tx, UserIdSchema.parse(principal.id)) : Promise.resolve(null),
    args.tenantCreated === true ? Promise.resolve(true) : deps.tenantGuard.isLive(tx, tenantId),
  ]);
  return { live, projection, user, tenantLive };
};

/** The organization was deleted after the caller authorized the change (decision 0030 §3). */
export const organizationGone = (): AccessNotFoundError => new AccessNotFoundError("organization");

type StateWrite = PrincipalRef & {
  readonly state: PrincipalState;
  readonly grants: readonly Membership[];
  readonly actorId: string;
  readonly now: string;
  /** Creates `users/{uid}` when it is missing and makes this tenant its active organization. */
  readonly newUser?: NewUserProfile | undefined;
};

const writeUser = (tx: Transaction, deps: Deps, args: StateWrite): void => {
  if (args.principal.type !== "user") return;
  const uid: UserId = UserIdSchema.parse(args.principal.id);
  const { state, tenantId, now, actorId } = args;
  if (state.user === null) {
    if (args.newUser !== undefined) deps.users.create(tx, { uid, profile: args.newUser, accessVersion: 1, activeOrganizationId: tenantId, createdAt: now });
    return;
  }
  const activate = args.newUser !== undefined && state.user.activeOrganizationId === null;
  deps.users.bump(tx, { uid, current: state.user, updatedAt: now, actorId, ...(activate ? { activeOrganizationId: tenantId } : {}) });
};

/**
 * Buffers the projection rebuild and the `accessVersion` bump for the principal's new
 * set of live grants (SP1 spec §5.4). Call after every read of the transaction.
 */
export const writePrincipalState = (tx: Transaction, deps: Deps, args: StateWrite): void => {
  const built = buildAccessProjection({ tenantId: args.tenantId, principal: args.principal, grants: args.grants.map((grant) => grant.node) });
  const projection: AccessProjection = {
    id: accessProjectionId({ tenantId: args.tenantId, principalId: args.principal.id }),
    ...built,
    version: (args.state.projection?.version ?? 0) + 1,
    updatedAt: args.now,
  };
  deps.projections.write(tx, { projection, actorId: args.actorId });
  writeUser(tx, deps, args);
};

export type GrantPlan = { readonly membership: Membership; readonly commit: () => Promise<void> };

export type PrepareGrantArgs = PrincipalRef & {
  readonly node: TenantNodeRef;
  readonly roles: readonly RoleRef[];
  readonly grantedBy: UserId;
  readonly actor: AuditActor;
  readonly requestId: string;
  readonly newUser?: NewUserProfile | undefined;
  /** The organization is created in the same transaction (`createOrganization`). */
  readonly organizationCreated?: boolean;
};

/**
 * Read phase of a grant, for callers that grant inside their own transaction
 * (`createOrganization`): checks uniqueness per (tenant, principal, node) and returns
 * the membership plus `commit()`, which buffers the membership, the projection, the
 * `accessVersion` bump and the audit entry. Call `commit()` after the caller's own reads.
 */
export const prepareGrant = async (tx: Transaction, deps: Deps, args: PrepareGrantArgs): Promise<Result<GrantPlan, MembershipExistsError | AccessNotFoundError>> => {
  const state = await readPrincipalState(tx, deps, { ...args, tenantCreated: args.organizationCreated === true });
  if (!state.tenantLive) return err(organizationGone());
  // A user grantee must exist (its users doc), unless this grant creates the doc.
  if (args.principal.type === "user" && state.user === null && args.newUser === undefined) return err(new AccessNotFoundError("user"));
  const nodeId = nodeIdOf(args.node);
  const existing = state.live.find((grant) => nodeIdOf(grant.node) === nodeId);
  if (existing !== undefined) return err(new MembershipExistsError(existing.id));
  const now = deps.clock.now().toISOString();
  const membership: Membership = {
    id: deps.memberships.newId(),
    tenantId: args.tenantId,
    principalType: args.principal.type,
    principalId: args.principal.id,
    node: args.node,
    roles: [...args.roles],
    grantedBy: args.grantedBy,
    createdAt: now,
    updatedAt: now,
  };
  const commit = async (): Promise<void> => {
    deps.memberships.create(tx, { membership, actorId: args.actor.id });
    writePrincipalState(tx, deps, { ...args, state, grants: [...state.live, membership], actorId: args.actor.id, now });
    await deps.audit.record(
      { log: "tenant", tenantId: args.tenantId, action: "MEMBERSHIP_GRANTED", actor: args.actor, target: { type: "membership", id: membership.id }, node: args.node, outcome: "success", requestId: args.requestId },
      tx,
    );
  };
  return ok({ membership, commit });
};
