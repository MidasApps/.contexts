// Composition of the members and invitations vertical (SP1 Task 11), next to the access
// write side it builds on (`createAccessServices`).
import type { MemberDeps } from "./application/member-deps.ts";
import { type AcceptInvitation, makeAcceptInvitation } from "./application/use-cases/accept-invitation.ts";
import { type CreateInvitation, makeCreateInvitation } from "./application/use-cases/create-invitation.ts";
import { type ListInvitations, makeListInvitations } from "./application/use-cases/list-invitations.ts";
import { type ListMembers, makeListMembers } from "./application/use-cases/list-members.ts";
import { type ListMemberships, makeListMemberships } from "./application/use-cases/list-memberships.ts";
import { makePreviewInvitation, type PreviewInvitation } from "./application/use-cases/preview-invitation.ts";
import { makeRemoveMember, type RemoveMember } from "./application/use-cases/remove-member.ts";
import { makeRevokeInvitation, type RevokeInvitation } from "./application/use-cases/revoke-invitation.ts";

export type MemberServices = {
  readonly listMembers: ListMembers;
  readonly removeMember: RemoveMember;
  readonly listMemberships: ListMemberships;
  readonly createInvitation: CreateInvitation;
  readonly listInvitations: ListInvitations;
  readonly revokeInvitation: RevokeInvitation;
  readonly previewInvitation: PreviewInvitation;
  readonly acceptInvitation: AcceptInvitation;
};

/** Binds the member and invitation use cases to their adapters. */
export const createMemberServices = (deps: MemberDeps): MemberServices => ({
  listMembers: makeListMembers(deps),
  removeMember: makeRemoveMember(deps),
  listMemberships: makeListMemberships(deps),
  createInvitation: makeCreateInvitation(deps),
  listInvitations: makeListInvitations(deps),
  revokeInvitation: makeRevokeInvitation(deps),
  previewInvitation: makePreviewInvitation(deps),
  acceptInvitation: makeAcceptInvitation(deps),
});
