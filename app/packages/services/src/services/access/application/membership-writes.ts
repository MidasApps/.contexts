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
import { MembershipExistsError } from "../domain/errors/membership-exists-error.ts";
import type { AccessWriteDeps } from "./access-write-deps.ts";
import type { NewUserProfile, UserAccessState } from "./ports/driven/user-access-version.ts";

/** Everything a grant change must read before writing (Firestore: reads first). */
export type PrincipalState = {
  readonly live: readonly Membership[];
  readonly projection: AccessProjection | null;
  /** The `users` doc state; always null for devices. */
  readonly user: UserAccessState | null;
};

type Deps = Pick<AccessWriteDeps, "memberships" | "projections" | "users" | "audit" | "clock">;

type PrincipalRef = { readonly tenantId: TenantId; readonly principal: ProjectionPrincipal };

/** Reads the principal's live grants, projection and user doc inside `tx`. */
export const readPrincipalState = async (tx: Transaction, deps: Deps, args: PrincipalRef): Promise<PrincipalState> => {
  const { tenantId, principal } = args;
  const [live, projection, user] = await Promise.all([
    deps.memberships.listOfPrincipal(tx, { tenantId, principalId: principal.id }),
    deps.projections.get(tx, { tenantId, principalId: principal.id }),
    principal.type === "user" ? deps.users.read(tx, UserIdSchema.parse(principal.id)) : Promise.resolve(null),
  ]);
  return { live, projection, user };
};

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
};

/**
 * Read phase of a grant, for callers that grant inside their own transaction
 * (`createOrganization`): checks uniqueness per (tenant, principal, node) and returns
 * the membership plus `commit()`, which buffers the membership, the projection, the
 * `accessVersion` bump and the audit entry. Call `commit()` after the caller's own reads.
 */
export const prepareGrant = async (tx: Transaction, deps: Deps, args: PrepareGrantArgs): Promise<Result<GrantPlan, MembershipExistsError>> => {
  const state = await readPrincipalState(tx, deps, args);
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
