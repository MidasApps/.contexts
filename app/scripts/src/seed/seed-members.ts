import type { AuthAdmin } from "./auth-admin.ts";
import {
  requireUid,
  type SeedCore,
  type SeedGrantNode,
  type SeedState,
  type SeedSystemRole,
} from "./seed-core-port.ts";
import { upsertOwnerUser } from "./seed-owner-user.ts";
import type { SeedTarget } from "./seed-target.ts";

type MemberGrant = {
  readonly user: "member" | "viewer";
  readonly role: SeedSystemRole;
  readonly at: "organization" | "first-project";
};

/** `member` holds `member` on the first project; `viewer` holds `viewer` on the organization. */
export const SEED_MEMBER_GRANTS: readonly MemberGrant[] = [
  { user: "member", role: "member", at: "first-project" },
  { user: "viewer", role: "viewer", at: "organization" },
];

const nodeOf = (state: SeedState, at: MemberGrant["at"]): SeedGrantNode => {
  const organizationId = state.demoOrganizationId;
  const projectId = state.firstProjectId;
  if (organizationId === undefined || projectId === undefined)
    throw new Error("seed step order: tenancy must be seeded first");
  return at === "organization"
    ? { level: "organization", organizationId }
    : { level: "project", organizationId, projectId };
};

/**
 * Accounts `member`, `viewer` and `invitee` (verified; the invitee has no membership, so the
 * SP2 e2e can accept an invitation with it), their profiles, and the grants of
 * `SEED_MEMBER_GRANTS` made by the owner. Both grantees start in the demo organization,
 * the project-level member included (decision 0030 A5).
 * Idempotent: an existing grant on the node is left as it is.
 */
export const seedMembers = async (args: {
  core: SeedCore;
  auth: AuthAdmin;
  target: SeedTarget;
  state: SeedState;
}): Promise<string> => {
  const { core, auth, target, state } = args;
  for (const key of ["member", "viewer", "invitee"] as const) {
    const { user } = await upsertOwnerUser(auth, target.users[key]);
    state.uids[key] = user.localId;
    await core.ensureProfile(user.localId);
  }
  const ownerUid = requireUid(state, "owner");
  const changes: string[] = [];
  for (const grant of SEED_MEMBER_GRANTS) {
    const principalUid = requireUid(state, grant.user);
    const node = nodeOf(state, grant.at);
    const granted = await core.grantRole({ actorUid: ownerUid, principalUid, node, role: grant.role });
    if (granted === "granted") changes.push(`${grant.user} as ${grant.role} on the ${grant.at}`);
    // Any live grant in the organization's tree lets its holder switch (decision 0030 A5).
    const active = await core.ensureActiveOrganization({ uid: principalUid, organizationId: node.organizationId });
    if (active === "set") changes.push(`${grant.user} active organization`);
  }
  // Accounts are always reset to the seeded password, like the owner.
  const accounts = "accounts member, viewer, invitee reset";
  return changes.length === 0 ? `unchanged grants; ${accounts}` : `granted ${changes.join(", ")}; ${accounts}`;
};
