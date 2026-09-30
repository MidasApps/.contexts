import { UserIdSchema, type Member, type Membership, type Principal, type TenantId } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { requirePermission } from "../grant-checks.ts";
import type { MemberDeps } from "../member-deps.ts";
import type { DirectoryEntry } from "../ports/driven/user-directory.ts";

export type ListMembersCommand = { readonly actor: Principal; readonly access: RequestAccess; readonly tenantId: TenantId; readonly page: PageRequest };

export type ListMembers = (command: ListMembersCommand) => Promise<Result<Page<Member>, AccessDeniedError>>;

const toMember = (uid: string, profile: DirectoryEntry, grants: readonly Membership[]): Member => ({
  uid: UserIdSchema.parse(uid),
  displayName: profile.displayName,
  email: profile.email,
  grants: [...grants]
    .sort((left, right) => (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0))
    .map((grant) => ({ membershipId: grant.id, node: grant.node, roles: grant.roles })),
});

/**
 * Users of an organization with their grants (`core.member.read` at the organization).
 * Pages over the access projections (one live doc per member, by uid), then reads those
 * members' grants and profiles. A member without a profile is skipped and logged.
 */
export const makeListMembers =
  (deps: Pick<MemberDeps, "projections" | "memberships" | "directory" | "logger">): ListMembers =>
  async (command) => {
    const { tenantId } = command;
    const allowed = await requirePermission({ ...command, permission: "core.member.read", node: { level: "organization", tenantId } });
    if (!allowed.ok) return allowed;
    const projections = await deps.projections.listMembers({ tenantId, page: command.page });
    const uids = projections.items.map((projection) => UserIdSchema.parse(projection.principalId));
    const [grants, profiles] = await Promise.all([deps.memberships.listOfPrincipals({ tenantId, principalIds: uids }), deps.directory.getMany(uids)]);
    const members = uids.flatMap((uid) => {
      const own = grants.filter((grant) => grant.principalId === uid);
      const profile = profiles.get(uid);
      if (own.length === 0) return [];
      if (profile === undefined) {
        deps.logger.warn("member_profile_missing", { tenantId, userId: uid });
        return [];
      }
      return [toMember(uid, profile, own)];
    });
    return ok({ items: members, nextCursor: projections.nextCursor });
  };
