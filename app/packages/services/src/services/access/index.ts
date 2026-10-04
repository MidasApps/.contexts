// Public API of the access context (SP1 Tasks 6 and 9): the only place that decides permissions.

export { ClaimsTooLargeError, MAX_CLAIMS_BYTES } from "./adapters/driven/firebase-claims-writer.ts";
export { createFirebaseUserDirectory } from "./adapters/driven/firebase-user-directory.ts";
export {
  createFirestoreAccessAdapters,
  type FirestoreAccessAdapters,
} from "./adapters/driven/firestore-access-adapters.ts";
export { createFirestoreApprovalRequestRepository } from "./adapters/driven/firestore-approval-request-repository.ts";
export { createFirestoreInvitationRepository } from "./adapters/driven/firestore-invitation-repository.ts";
export { createFirestoreOrganizationDirectory } from "./adapters/driven/firestore-organization-directory.ts";
export {
  type AccessReaderCall,
  createInMemoryAccessStore,
  type InMemoryAccessStore,
} from "./adapters/driven/in-memory-access-store.ts";
export {
  createInMemoryAccessWriteStore,
  type InMemoryAccessWriteStore,
} from "./adapters/driven/in-memory-access-write-store.ts";
export {
  createInMemoryApprovalRequestRepository,
  type InMemoryApprovalRequestRepository,
} from "./adapters/driven/in-memory-approval-request-repository.ts";
export {
  createInMemoryInvitationRepository,
  type InMemoryInvitationRepository,
} from "./adapters/driven/in-memory-invitation-repository.ts";
export { createNoopInvitationNotifier } from "./adapters/driven/noop-invitation-notifier.ts";
export { accessErrorResponse } from "./adapters/driving/access-error-response.ts";
export type { AccessWriteDeps } from "./application/access-write-deps.ts";
export type { DecideCommand, DecisionError } from "./application/approval-decision.ts";
export type { ApprovalDeps } from "./application/approval-deps.ts";
export {
  type ApprovalHandlerRegistry,
  ApprovalHandlerRegistryError,
  type ApprovalHandlerRegistryErrorCode,
  createApprovalHandlerRegistry,
  type RegisteredApprovalHandler,
} from "./application/approval-handler-registry.ts";
export {
  checkGrantable,
  type GrantCheckError,
  requireNoEscalation,
  requirePermission,
} from "./application/grant-checks.ts";
export { AppUrlMissingError, type MemberDeps } from "./application/member-deps.ts";
export type { GrantPlan, PrepareGrantArgs } from "./application/membership-writes.ts";
export type { AccessProjectionStore } from "./application/ports/driven/access-projection-writer.ts";
export type { AccessReaders } from "./application/ports/driven/access-readers.ts";
export type {
  ApprovalActionContext,
  ApprovalActionHandler,
} from "./application/ports/driven/approval-action-handler.ts";
export type {
  ApprovalRequestRepository,
  ApprovalStatusChange,
} from "./application/ports/driven/approval-request-repository.ts";
export { type ClaimsWriter, CORE_CLAIM_KEYS, type CoreClaims } from "./application/ports/driven/claims-writer.ts";
export type { GrantReader } from "./application/ports/driven/grant-reader.ts";
export type { InvitationNotifier } from "./application/ports/driven/invitation-notifier.ts";
export type { InvitationRepository } from "./application/ports/driven/invitation-repository.ts";
export type { MembershipRepository } from "./application/ports/driven/membership-repository.ts";
export type { NodeChainReader } from "./application/ports/driven/node-chain-reader.ts";
export type { OrganizationDirectory } from "./application/ports/driven/organization-directory.ts";
export type {
  ApiKeyStatusRecord,
  DeviceStatusRecord,
  ImpersonationSessionRecord,
  PlatformStaffRecord,
  PrincipalStatusReader,
  UserStatusRecord,
} from "./application/ports/driven/principal-status-reader.ts";
export type { RoleReader } from "./application/ports/driven/role-reader.ts";
export type { RoleRepository } from "./application/ports/driven/role-repository.ts";
export type {
  NewUserProfile,
  UserAccessState,
  UserAccessVersionStore,
} from "./application/ports/driven/user-access-version.ts";
export type { DirectoryAccount, DirectoryEntry, UserDirectory } from "./application/ports/driven/user-directory.ts";
export type {
  Authorize,
  AuthorizeRequest,
  EffectivePermissionsRequest,
  EffectivePermissionsResult,
  GetEffectivePermissions,
} from "./application/ports/driving/authorize.ts";
export { createRequestScope } from "./application/request-scope.ts";
export type { AccessDeps } from "./application/tenant-access.ts";
export type {
  AcceptInvitation,
  AcceptInvitationCommand,
  AcceptInvitationError,
} from "./application/use-cases/accept-invitation.ts";
export type { ApproveRequest } from "./application/use-cases/approve-request.ts";
export { makeAuthorize } from "./application/use-cases/authorize.ts";
export type { CreateInvitation, CreateInvitationCommand } from "./application/use-cases/create-invitation.ts";
export { makeGetEffectivePermissions } from "./application/use-cases/get-effective-permissions.ts";
export type {
  GrantMembership,
  GrantMembershipCommand,
  GrantMembershipError,
} from "./application/use-cases/grant-membership.ts";
export type {
  ListApprovalRequests,
  ListApprovalRequestsCommand,
} from "./application/use-cases/list-approval-requests.ts";
export type { RejectRequest } from "./application/use-cases/reject-request.ts";
export type { RemoveMember, RemoveMemberCommand, RemoveMemberError } from "./application/use-cases/remove-member.ts";
export type {
  RequestApproval,
  RequestApprovalCommand,
  RequestApprovalError,
} from "./application/use-cases/request-approval.ts";
export type {
  RevokeMembership,
  RevokeMembershipCommand,
  RevokeMembershipError,
} from "./application/use-cases/revoke-membership.ts";
export { computeCoreClaims, makeSyncClaims, type SyncClaims } from "./application/use-cases/sync-claims.ts";
export type {
  UpdateMembership,
  UpdateMembershipCommand,
  UpdateMembershipError,
} from "./application/use-cases/update-membership.ts";
// Four-eyes approval requests (SP1 Task 17): SP3 tool approvals, SP5 workflow HITL and inbox.
export {
  type ApprovalServices,
  createApprovalServices,
  createFirestoreApprovalServices,
} from "./approval-composition.ts";
export {
  type AccessCore,
  type AccessServices,
  createAccessCore,
  createAccessServices,
  type RequestAccess,
} from "./composition.ts";
export {
  type AccessProjectionState,
  buildAccessProjection,
  nodeIdOf,
  type ProjectionPrincipal,
} from "./domain/access-projection.ts";
export {
  type ApprovalTransition,
  approvalView,
  effectiveApprovalStatus,
  nextApprovalStatus,
} from "./domain/approval-state.ts";
export type { AuthorizeDecision, DenyReason, GrantSource } from "./domain/authorization.ts";
export { computeEffectivePermissions, type EffectivePermissions } from "./domain/effective-permissions.ts";
export { maskEmail, normalizeEmail, sameEmail } from "./domain/email.ts";
export { AccessDeniedError } from "./domain/errors/access-denied-error.ts";
export { AccessNotFoundError } from "./domain/errors/access-not-found-error.ts";
export {
  ApprovalInputInvalidError,
  ApprovalNotFoundError,
  ApprovalNotPendingError,
  ApprovalNotRequiredError,
  UnknownApprovalActionError,
} from "./domain/errors/approval-errors.ts";
export { EscalationForbiddenError } from "./domain/errors/escalation-forbidden-error.ts";
export {
  EmailMismatchError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
} from "./domain/errors/invitation-errors.ts";
export { LastOwnerError } from "./domain/errors/last-owner-error.ts";
export { MembershipExistsError } from "./domain/errors/membership-exists-error.ts";
export { RoleInUseError } from "./domain/errors/role-in-use-error.ts";
export { SelfApprovalForbiddenError } from "./domain/errors/self-approval-forbidden-error.ts";
export { UnknownPermissionError } from "./domain/errors/unknown-permission-error.ts";
export { UnknownRoleError } from "./domain/errors/unknown-role-error.ts";
export { assertNoEscalation, type EscalationCheck } from "./domain/escalation-guard.ts";
export type { CustomRoleRecord, GrantRecord } from "./domain/grant.ts";
export { checkInvitationUsable, effectiveInvitationStatus } from "./domain/invitation-state.ts";
export {
  buildAcceptUrl,
  generateInvitationToken,
  hashInvitationToken,
  InvalidRandomBytesError,
  type RandomBytes,
} from "./domain/invitation-token.ts";
export {
  type ChainNode,
  type ChainUnit,
  chainNodeIds,
  checkNodeChain,
  isNodeWithin,
  type NodeChain,
} from "./domain/node-chain.ts";
export {
  CORE_PERMISSION_SOURCE,
  createPermissionRegistry,
  type PermissionRegistry,
  PermissionRegistryError,
  type PermissionRegistryErrorCode,
  type PermissionSource,
} from "./domain/permission-registry.ts";
export {
  customRoleIdsOf,
  holdsOwner,
  resolveRolePermissions,
  unknownTenantPermissions,
} from "./domain/role-permissions.ts";
// Members and invitations (SP1 Task 11).
export { createMemberServices, type MemberServices } from "./member-composition.ts";
