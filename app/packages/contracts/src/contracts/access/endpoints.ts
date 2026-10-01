// Access `/v1` descriptors (SP1 spec §7.3: permissions, roles, members, memberships,
// invitations, approval requests).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { OrganizationParamsSchema } from "../tenancy/endpoints.ts";
import {
  ApprovalRequestIdSchema,
  ApprovalRequestSchema,
  ApprovalStatusSchema,
  CreateApprovalRequestInputSchema,
  DecideApprovalRequestInputSchema,
} from "./approval-request.schema.ts";
import { CreateRoleInputSchema } from "./create-role-input.schema.ts";
import { GrantMembershipInputSchema } from "./grant-membership-input.schema.ts";
import {
  AcceptInvitationResponseSchema,
  CreateInvitationInputSchema,
  CreateInvitationResponseSchema,
  InvitationIdSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  InvitationStatusSchema,
  InvitationTokenInputSchema,
} from "./invitation.schema.ts";
import { MemberSchema } from "./member.schema.ts";
import { MembershipIdSchema, MembershipSchema } from "./membership.schema.ts";
import { PermissionDefinitionSchema } from "./permission-definition.schema.ts";
import { RoleIdSchema } from "./role-ref.schema.ts";
import { RoleSchema } from "./role.schema.ts";
import { UpdateMembershipInputSchema } from "./update-membership-input.schema.ts";
import { UpdateRoleInputSchema } from "./update-role-input.schema.ts";

const NOT_FOUND = ["NOT_FOUND"] as const;
const FORBIDDEN = ["FORBIDDEN"] as const;
const NO_ESCALATION = ["FORBIDDEN", "ESCALATION_FORBIDDEN"] as const;

const roleParams = z.object({ roleId: RoleIdSchema.meta(none("Custom role id.")) });
const membershipParams = z.object({ membershipId: MembershipIdSchema.meta(none("Membership id.")) });
const approvalParams = z.object({ approvalRequestId: ApprovalRequestIdSchema.meta(none("Approval request id.")) });

export const listPermissionsEndpoint = defineEndpoint({
  id: "access.listPermissions",
  method: "GET",
  path: "/v1/permissions",
  auth: "user",
  query: PageQuerySchema,
  responses: { 200: listEnvelope(PermissionDefinitionSchema) },
  summary: "Lists the registered tenant permissions (core and modules).",
});

export const listRolesEndpoint = defineEndpoint({
  id: "access.listRoles",
  method: "GET",
  path: "/v1/organizations/{organizationId}/roles",
  auth: "user",
  params: OrganizationParamsSchema,
  query: PageQuerySchema,
  responses: { 200: listEnvelope(RoleSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists the custom roles of an organization (core.role.read).",
});

export const createRoleEndpoint = defineEndpoint({
  id: "access.createRole",
  method: "POST",
  path: "/v1/organizations/{organizationId}/roles",
  auth: "user",
  params: OrganizationParamsSchema,
  body: CreateRoleInputSchema,
  responses: { 201: dataEnvelope(RoleSchema) },
  errors: { 403: NO_ESCALATION, 404: NOT_FOUND, 422: ["UNKNOWN_PERMISSION"] },
  idempotency: "optional",
  summary: "Creates a custom role (core.role.create).",
});

export const getRoleEndpoint = defineEndpoint({
  id: "access.getRole",
  method: "GET",
  path: "/v1/roles/{roleId}",
  auth: "user",
  params: roleParams,
  responses: { 200: dataEnvelope(RoleSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Reads a custom role (core.role.read).",
});

export const updateRoleEndpoint = defineEndpoint({
  id: "access.updateRole",
  method: "PATCH",
  path: "/v1/roles/{roleId}",
  auth: "user",
  params: roleParams,
  body: UpdateRoleInputSchema,
  responses: { 200: dataEnvelope(RoleSchema) },
  errors: { 403: NO_ESCALATION, 404: NOT_FOUND, 422: ["UNKNOWN_PERMISSION"] },
  summary: "Changes a custom role (core.role.update).",
});

export const deleteRoleEndpoint = defineEndpoint({
  id: "access.deleteRole",
  method: "DELETE",
  path: "/v1/roles/{roleId}",
  auth: "user",
  params: roleParams,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND, 409: ["ROLE_IN_USE"] },
  summary: "Deletes a custom role no grant uses (core.role.delete).",
});

export const listMembersEndpoint = defineEndpoint({
  id: "access.listMembers",
  method: "GET",
  path: "/v1/organizations/{organizationId}/members",
  auth: "user",
  params: OrganizationParamsSchema,
  query: PageQuerySchema,
  responses: { 200: listEnvelope(MemberSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists the users of an organization with their grants (core.member.read).",
});

export const removeMemberEndpoint = defineEndpoint({
  id: "access.removeMember",
  method: "DELETE",
  path: "/v1/organizations/{organizationId}/members/{userId}",
  auth: "user",
  params: OrganizationParamsSchema.extend({ userId: UserIdSchema.meta(none("Uid of the member.")) }),
  responses: { 204: null },
  errors: { 403: NO_ESCALATION, 404: NOT_FOUND, 422: ["LAST_OWNER"] },
  summary: "Removes a member: every grant and every API key they own there (core.member.remove; the member's permissions within the caller's).",
});

export const listMembershipsEndpoint = defineEndpoint({
  id: "access.listMemberships",
  method: "GET",
  path: "/v1/organizations/{organizationId}/memberships",
  auth: "user",
  params: OrganizationParamsSchema,
  query: PageQuerySchema.extend({
    principalId: z.string().min(1).optional().meta(none("Only grants of this user or device.")),
  }),
  responses: { 200: listEnvelope(MembershipSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists the grants of an organization (core.member.read).",
});

export const grantMembershipEndpoint = defineEndpoint({
  id: "access.grantMembership",
  method: "POST",
  path: "/v1/organizations/{organizationId}/memberships",
  auth: "user",
  params: OrganizationParamsSchema,
  body: GrantMembershipInputSchema,
  responses: { 201: dataEnvelope(MembershipSchema) },
  errors: { 403: NO_ESCALATION, 404: NOT_FOUND, 409: ["MEMBERSHIP_EXISTS"] },
  idempotency: "optional",
  summary: "Grants roles to a member at a node (core.member.update at the node).",
});

export const updateMembershipEndpoint = defineEndpoint({
  id: "access.updateMembership",
  method: "PATCH",
  path: "/v1/memberships/{membershipId}",
  auth: "user",
  params: membershipParams,
  body: UpdateMembershipInputSchema,
  responses: { 200: dataEnvelope(MembershipSchema) },
  errors: { 403: NO_ESCALATION, 404: NOT_FOUND, 422: ["LAST_OWNER"] },
  summary: "Replaces the roles of a grant (core.member.update; old and new roles within the caller's).",
});

export const revokeMembershipEndpoint = defineEndpoint({
  id: "access.revokeMembership",
  method: "DELETE",
  path: "/v1/memberships/{membershipId}",
  auth: "user",
  params: membershipParams,
  responses: { 204: null },
  errors: { 403: NO_ESCALATION, 404: NOT_FOUND, 422: ["LAST_OWNER"] },
  summary: "Revokes a grant (core.member.remove; the grant's permissions within the caller's).",
});

export const listInvitationsEndpoint = defineEndpoint({
  id: "access.listInvitations",
  method: "GET",
  path: "/v1/organizations/{organizationId}/invitations",
  auth: "user",
  params: OrganizationParamsSchema,
  query: PageQuerySchema.extend({ status: InvitationStatusSchema.optional().meta(none("Only invitations in this state.")) }),
  responses: { 200: listEnvelope(InvitationSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists invitations, never their tokens (core.member.read).",
});

export const createInvitationEndpoint = defineEndpoint({
  id: "access.createInvitation",
  method: "POST",
  path: "/v1/organizations/{organizationId}/invitations",
  auth: "user",
  params: OrganizationParamsSchema,
  body: CreateInvitationInputSchema,
  responses: { 201: dataEnvelope(CreateInvitationResponseSchema) },
  errors: { 403: NO_ESCALATION, 404: NOT_FOUND },
  idempotency: "optional",
  summary: "Invites an email and returns the one-time accept link (core.member.invite).",
});

export const revokeInvitationEndpoint = defineEndpoint({
  id: "access.revokeInvitation",
  method: "DELETE",
  path: "/v1/invitations/{invitationId}",
  auth: "user",
  params: z.object({ invitationId: InvitationIdSchema.meta(none("Invitation id.")) }),
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Revokes a pending invitation (core.member.invite).",
});

export const previewInvitationEndpoint = defineEndpoint({
  id: "access.previewInvitation",
  method: "POST",
  path: "/v1/invitations/preview",
  auth: "user",
  body: InvitationTokenInputSchema,
  responses: { 200: dataEnvelope(InvitationPreviewSchema) },
  errors: { 404: NOT_FOUND, 409: ["INVITATION_ALREADY_USED"], 410: ["INVITATION_EXPIRED"] },
  rateLimit: "invitation-preview",
  summary: "Shows who invited the caller and to which organization.",
});

export const acceptInvitationEndpoint = defineEndpoint({
  id: "access.acceptInvitation",
  method: "POST",
  path: "/v1/invitations/accept",
  auth: "user",
  body: InvitationTokenInputSchema,
  responses: { 200: dataEnvelope(AcceptInvitationResponseSchema) },
  errors: { 403: ["EMAIL_MISMATCH"], 404: NOT_FOUND, 409: ["INVITATION_ALREADY_USED"], 410: ["INVITATION_EXPIRED"] },
  rateLimit: "invitation-accept",
  summary: "Accepts an invitation whose email matches the caller's verified email.",
});

export const listApprovalRequestsEndpoint = defineEndpoint({
  id: "access.listApprovalRequests",
  method: "GET",
  path: "/v1/organizations/{organizationId}/approval-requests",
  auth: "user",
  params: OrganizationParamsSchema,
  query: PageQuerySchema.extend({ status: ApprovalStatusSchema.optional().meta(none("Only requests in this state.")) }),
  responses: { 200: listEnvelope(ApprovalRequestSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists approval requests (core.approval.read).",
});

export const createApprovalRequestEndpoint = defineEndpoint({
  id: "access.createApprovalRequest",
  method: "POST",
  path: "/v1/organizations/{organizationId}/approval-requests",
  auth: "principal",
  params: OrganizationParamsSchema,
  body: CreateApprovalRequestInputSchema,
  responses: { 201: dataEnvelope(ApprovalRequestSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND, 422: ["UNKNOWN_APPROVAL_ACTION", "APPROVAL_NOT_REQUIRED"] },
  idempotency: "optional",
  summary: "Asks for approval of an action (the caller must hold its permission at the node).",
});

export const getApprovalRequestEndpoint = defineEndpoint({
  id: "access.getApprovalRequest",
  method: "GET",
  path: "/v1/approval-requests/{approvalRequestId}",
  auth: "user",
  params: approvalParams,
  responses: { 200: dataEnvelope(ApprovalRequestSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Reads one approval request (core.approval.read at its node; 404 when the caller cannot see it).",
});

export const approveApprovalRequestEndpoint = defineEndpoint({
  id: "access.approveApprovalRequest",
  method: "POST",
  path: "/v1/approval-requests/{approvalRequestId}/approve",
  auth: "user",
  params: approvalParams,
  body: DecideApprovalRequestInputSchema,
  responses: { 200: dataEnvelope(ApprovalRequestSchema) },
  errors: { 403: ["FORBIDDEN", "SELF_APPROVAL_FORBIDDEN"], 404: NOT_FOUND, 409: ["CONFLICT"] },
  summary: "Approves and executes a request at most once (core.approval.decide plus the action's permission).",
});

export const rejectApprovalRequestEndpoint = defineEndpoint({
  id: "access.rejectApprovalRequest",
  method: "POST",
  path: "/v1/approval-requests/{approvalRequestId}/reject",
  auth: "user",
  params: approvalParams,
  body: DecideApprovalRequestInputSchema,
  responses: { 200: dataEnvelope(ApprovalRequestSchema) },
  errors: { 403: ["FORBIDDEN", "SELF_APPROVAL_FORBIDDEN"], 404: NOT_FOUND, 409: ["CONFLICT"] },
  summary: "Rejects a pending request (core.approval.decide plus the action's permission).",
});

export const ACCESS_ENDPOINTS: readonly EndpointDefinition[] = [
  listPermissionsEndpoint,
  listRolesEndpoint,
  createRoleEndpoint,
  getRoleEndpoint,
  updateRoleEndpoint,
  deleteRoleEndpoint,
  listMembersEndpoint,
  removeMemberEndpoint,
  listMembershipsEndpoint,
  grantMembershipEndpoint,
  updateMembershipEndpoint,
  revokeMembershipEndpoint,
  listInvitationsEndpoint,
  createInvitationEndpoint,
  revokeInvitationEndpoint,
  previewInvitationEndpoint,
  acceptInvitationEndpoint,
  listApprovalRequestsEndpoint,
  createApprovalRequestEndpoint,
  getApprovalRequestEndpoint,
  approveApprovalRequestEndpoint,
  rejectApprovalRequestEndpoint,
];
