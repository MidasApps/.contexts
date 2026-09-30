import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal, sensitive } from "../field-docs.ts";
import { firestoreIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { roleRefsField } from "./role-ref.schema.ts";

export const InvitationIdSchema = firestoreIdSchema<"InvitationId">();
export type InvitationId = z.infer<typeof InvitationIdSchema>;

export const INVITATION_TTL_DAYS = 7;

export const InvitationStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

/** 32 random bytes, base64url without padding; stored only as sha256 (SP1 spec §6.2). */
export const InvitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, { error: "Expected a 43-char base64url token." });

const nodeField = () => tenantNodeRefField("Node the invitee will be granted at.");
const rolesField = () => roleRefsField("Roles the invitee will get (no escalation).");

/** An invitation as listed; never carries the token or its hash. */
export const InvitationSchema = z.object({
  id: InvitationIdSchema.meta(none("Automatic id of the invitation.")),
  tenantId: TenantIdSchema.meta(none("Organization the invitation is for.")),
  email: z.email().meta(personal("Invited email; accepting requires the same verified email.")),
  node: nodeField(),
  roles: rolesField(),
  status: InvitationStatusSchema.meta(none("pending, accepted, revoked or expired.")),
  expiresAt: IsoDateTimeSchema.meta(none("When the invitation stops working (UTC), 7 days after creation.")),
  invitedBy: UserIdSchema.meta(personal("User who sent the invitation.")),
  acceptedByUid: UserIdSchema.nullable().meta(personal("User who accepted it; null until then.")),
  createdAt: IsoDateTimeSchema.meta(none("When the invitation was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the invitation last changed (UTC).")),
});
export type Invitation = z.infer<typeof InvitationSchema>;

const INVITATION_EXAMPLE = {
  id: EXAMPLE_IDS.invitation,
  tenantId: EXAMPLE_IDS.organization,
  email: "carla@example.com",
  node: { level: "organization", tenantId: EXAMPLE_IDS.organization },
  roles: [{ kind: "system", key: "member" }],
  status: "pending",
  expiresAt: EXAMPLE_TIMES.expires,
  invitedBy: EXAMPLE_IDS.user,
  acceptedByUid: null,
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.created,
} as const;
const EXAMPLE_TOKEN = "Zx9Cv8Bn7Mm6Aa5Ss4Dd3Ff2Gg1Hh0Jj9Kk8Ll7Qq6W";

export const InvitationContract = defineContract(InvitationSchema, {
  id: "access.Invitation",
  kind: "entity",
  description: "An invitation to join an organization at a node with roles (SP1 spec §6.2).",
  examples: [INVITATION_EXAMPLE],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.member.read",
});

export const CreateInvitationInputSchema = z.strictObject({
  email: z.email().meta(personal("Email to invite.")),
  node: nodeField(),
  roles: rolesField(),
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationInputSchema>;

export const CreateInvitationInputContract = defineContract(CreateInvitationInputSchema, {
  id: "access.CreateInvitationInput",
  kind: "command",
  description: "Invites an email to the organization (core.member.invite).",
  examples: [{ email: INVITATION_EXAMPLE.email, node: INVITATION_EXAMPLE.node, roles: INVITATION_EXAMPLE.roles }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.member.invite",
});

export const CreateInvitationResponseSchema = z.object({
  invitation: z.object(InvitationSchema.shape).meta(personal("The created invitation, as later listed.")),
  acceptUrl: z.url().meta(sensitive("One-time link `<app>/{locale}/invite#token=<token>` in the inviter's locale (else the organization default), returned only here.")),
});
export type CreateInvitationResponse = z.infer<typeof CreateInvitationResponseSchema>;

export const CreateInvitationResponseContract = defineContract(CreateInvitationResponseSchema, {
  id: "access.CreateInvitationResponse",
  kind: "view",
  description: "Answer of invitation creation with the one-time accept link.",
  examples: [{ invitation: INVITATION_EXAMPLE, acceptUrl: `https://app.example.com/pt-BR/invite#token=${EXAMPLE_TOKEN}` }],
  pii: "sensitive",
  tenancyScope: "organization",
  relations: [],
});

/** Body of preview and accept: the token from the link fragment. */
export const InvitationTokenInputSchema = z.strictObject({
  token: InvitationTokenSchema.meta(sensitive("Token from the `#token=` fragment of the accept link.")),
});
export type InvitationTokenInput = z.infer<typeof InvitationTokenInputSchema>;

export const InvitationTokenInputContract = defineContract(InvitationTokenInputSchema, {
  id: "access.InvitationTokenInput",
  kind: "command",
  description: "Token of an invitation link, sent to preview or accept it (Bearer required).",
  examples: [{ token: EXAMPLE_TOKEN }],
  pii: "sensitive",
  tenancyScope: "user",
  relations: [],
});

export const InvitationPreviewSchema = z.object({
  organizationName: z.string().min(1).meta(none("Name of the inviting organization.")),
  inviterDisplayName: z.string().meta(personal("Display name of the inviter; may be empty.")),
  maskedEmail: z.string().min(1).meta(personal("Invited email, masked (`c***@example.com`).")),
  expiresAt: IsoDateTimeSchema.meta(none("When the invitation stops working (UTC).")),
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

export const InvitationPreviewContract = defineContract(InvitationPreviewSchema, {
  id: "access.InvitationPreview",
  kind: "view",
  description: "What an invitee sees before accepting (POST /v1/invitations/preview).",
  examples: [{ organizationName: "Northwind", inviterDisplayName: "Ana Souza", maskedEmail: "c***@example.com", expiresAt: EXAMPLE_TIMES.expires }],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});

export const AcceptInvitationResponseSchema = z.object({
  organizationId: OrganizationIdSchema.meta(none("Organization the caller just joined.")),
});
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponseSchema>;

export const AcceptInvitationResponseContract = defineContract(AcceptInvitationResponseSchema, {
  id: "access.AcceptInvitationResponse",
  kind: "view",
  description: "Answer of POST /v1/invitations/accept.",
  examples: [{ organizationId: EXAMPLE_IDS.organization }],
  pii: "none",
  tenancyScope: "user",
  relations: [],
});
