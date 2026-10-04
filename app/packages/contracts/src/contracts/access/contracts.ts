// Every access contract, in catalog order; composition.ts registers them.
import type { ContractDefinition } from "../contract.ts";
import { AccessContextContract } from "./access-context.schema.ts";
import { AccessProjectionContract } from "./access-projection.schema.ts";
import {
  ApprovalRequestContract,
  CreateApprovalRequestInputContract,
  DecideApprovalRequestInputContract,
} from "./approval-request.schema.ts";
import { CreateRoleInputContract } from "./create-role-input.schema.ts";
import { GrantMembershipInputContract } from "./grant-membership-input.schema.ts";
import {
  AcceptInvitationResponseContract,
  CreateInvitationInputContract,
  CreateInvitationResponseContract,
  InvitationContract,
  InvitationPreviewContract,
  InvitationTokenInputContract,
} from "./invitation.schema.ts";
import { MemberContract } from "./member.schema.ts";
import { MembershipContract } from "./membership.schema.ts";
import { MyGrantContract } from "./my-grant.schema.ts";
import { PermissionDefinitionContract } from "./permission-definition.schema.ts";
import { RoleContract } from "./role.schema.ts";
import { RoleRefContract } from "./role-ref.schema.ts";
import { UpdateMembershipInputContract } from "./update-membership-input.schema.ts";
import { UpdateRoleInputContract } from "./update-role-input.schema.ts";

export const ACCESS_CONTRACTS: readonly ContractDefinition[] = [
  PermissionDefinitionContract,
  RoleRefContract,
  RoleContract,
  CreateRoleInputContract,
  UpdateRoleInputContract,
  MembershipContract,
  GrantMembershipInputContract,
  UpdateMembershipInputContract,
  MemberContract,
  AccessProjectionContract,
  AccessContextContract,
  MyGrantContract,
  InvitationContract,
  CreateInvitationInputContract,
  CreateInvitationResponseContract,
  InvitationTokenInputContract,
  InvitationPreviewContract,
  AcceptInvitationResponseContract,
  ApprovalRequestContract,
  CreateApprovalRequestInputContract,
  DecideApprovalRequestInputContract,
];
