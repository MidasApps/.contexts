// Public API of @core/contracts. Explicit named re-exports only (no `export *`).
export {
  ContractDefinitionError,
  type ContractDefinitionErrorCode,
} from "./contracts/contract-definition-error.ts";
export {
  isFieldOptional,
  listTopLevelFields,
  readFieldMeta,
  readRawFieldMeta,
  type ZodMetaRegistry,
} from "./contracts/field-meta.ts";
export { CORE_CONTRACTS, CORE_ENDPOINTS, composeCoreContracts, composeCoreEndpoints } from "./composition.ts";
export {
  defineEndpoint,
  pathParamNames,
  type EndpointAuth,
  type EndpointDefinition,
  type EndpointErrors,
  type EndpointResponses,
  type ErrorStatus,
  type HttpMethod,
  type InferEndpointInput,
  type InferEndpointResponse,
  type SuccessStatus,
} from "./contracts/http/endpoint.ts";
export { EndpointDefinitionError, type EndpointDefinitionErrorCode } from "./contracts/http/endpoint-definition-error.ts";
export { createEndpointRegistry, type EndpointRegistry } from "./contracts/http/endpoint-registry.ts";
export {
  dataEnvelope,
  ErrorCodeSchema,
  ErrorDetailSchema,
  ErrorEnvelopeContract,
  ErrorEnvelopeSchema,
  listEnvelope,
  PageMetaSchema,
  PageQuerySchema,
  type ErrorCode,
  type ErrorDetail,
  type ErrorEnvelope,
  type PageMeta,
  type PageQuery,
} from "./contracts/http/envelopes.schema.ts";
export { defineContract, type ContractDefinition } from "./contracts/contract.ts";
export { inspectSchema, isPiiBelow, maxPii, type FieldMetaInspection, type FieldMetaProblem } from "./contracts/field-meta-rules.ts";
export { createContractRegistry, type ContractRegistry, type RegisteredContract } from "./contracts/registry.ts";
export {
  CatalogMetaSchema,
  ContractIdSchema,
  ContractKindSchema,
  CUSTOM_META_KEYS,
  FieldMetaSchema,
  PermissionSchema,
  PiiLevelSchema,
  RelationSchema,
  TenancyScopeSchema,
  UiMetaSchema,
  type CatalogMeta,
  type ContractId,
  type ContractKind,
  type FieldMeta,
  type Permission,
  type PiiLevel,
  type Relation,
  type TenancyScope,
  type UiMeta,
} from "./contracts/primitives/catalog-meta.schema.ts";
export {
  EventIdSchema,
  firestoreIdSchema,
  IdempotencyKeySchema,
  RequestIdSchema,
  TenantIdSchema,
  UserIdSchema,
  type EventId,
  type IdempotencyKey,
  type RequestId,
  type TenantId,
  type UserId,
} from "./contracts/primitives/ids.schema.ts";
export { IsoDateTimeSchema, type IsoDateTime } from "./contracts/primitives/iso-datetime.schema.ts";
export { LocaleSchema, type Locale } from "./contracts/primitives/locale.schema.ts";
export { CurrencySchema, MoneySchema, type Currency, type Money } from "./contracts/primitives/money.schema.ts";
export { TimeZoneSchema, type TimeZone } from "./contracts/primitives/time-zone.schema.ts";
// SP3 agent runtime contracts.
export { AGENT_PERMISSIONS, type AgentPermissionDefinition } from "./contracts/agents/agent-permissions.ts";
export { AGENTS_ENDPOINTS, callMcpEndpoint, McpMessageSchema, McpResponseSchema } from "./contracts/agents/endpoints.ts";
export {
  AgentRequestContextContract,
  AgentRequestContextSchema,
  type AgentRequestContext,
} from "./contracts/agents/agent-request-context.schema.ts";
export {
  AgentKeySchema,
  AgentSettingsContract,
  AgentSettingsSchema,
  type AgentKey,
  type AgentSettings,
} from "./contracts/agents/agent-settings.schema.ts";
export {
  AGENT_COMMAND_ACTION_KIND,
  AgentApprovalRequestContract,
  AgentApprovalRequestSchema,
  type AgentApprovalRequest,
} from "./contracts/agents/approval-request.schema.ts";
export {
  ACTIVE_SCREEN_MAX_LENGTH,
  FORWARDED_HEADERS,
  type ForwardedHeaderName,
} from "./contracts/agents/forwarded-headers.ts";
export { ToolUiContract, ToolUiSchema, type ToolUi } from "./contracts/agents/tool-ui.schema.ts";
export {
  CitationContract,
  CitationIdSchema,
  CitationSchema,
  type Citation,
  type CitationId,
} from "./contracts/knowledge/citation.schema.ts";
export {
  KnowledgeDocumentContract,
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentSchema,
  KnowledgeDocumentSourceSchema,
  KnowledgeDocumentStatusSchema,
  KnowledgeNamespaceSchema,
  PLATFORM_TENANT_ID,
  type KnowledgeDocument,
  type KnowledgeDocumentId,
  type KnowledgeDocumentSource,
  type KnowledgeDocumentStatus,
  type KnowledgeNamespace,
} from "./contracts/knowledge/knowledge-document.schema.ts";
export { KnowledgeSourceContract, KnowledgeSourceSchema, type KnowledgeSource } from "./contracts/knowledge/knowledge-source.schema.ts";
export {
  addKnowledgeSourceEndpoint,
  deleteKnowledgeDocumentEndpoint,
  getKnowledgeDocumentEndpoint,
  KNOWLEDGE_ENDPOINTS,
  type KnowledgeIngestionRun,
  KnowledgeIngestionRunSchema,
  listKnowledgeDocumentsEndpoint,
} from "./contracts/knowledge/endpoints.ts";
export {
  AllowedHostSchema,
  ConnectorContract,
  ConnectorIdSchema,
  ConnectorSchema,
  type Connector,
  type ConnectorId,
  type ConnectorType,
} from "./contracts/connectors/connector.schema.ts";
export {
  ConnectorToolNameSchema,
  ConnectorToolPolicyContract,
  ConnectorToolPolicySchema,
  type ConnectorToolPolicy,
} from "./contracts/connectors/connector-tool-policy.schema.ts";
export {
  CreateConnectorInputContract,
  CreateConnectorInputSchema,
  type CreateConnectorInput,
  SetConnectorSecretInputContract,
  SetConnectorSecretInputSchema,
  type SetConnectorSecretInput,
  UpdateConnectorInputContract,
  UpdateConnectorInputSchema,
  type UpdateConnectorInput,
} from "./contracts/connectors/connector-input.schema.ts";
export {
  CONNECTORS_ENDPOINTS,
  createConnectorEndpoint,
  deleteConnectorEndpoint,
  getConnectorEndpoint,
  listConnectorsEndpoint,
  setConnectorSecretEndpoint,
  updateConnectorEndpoint,
} from "./contracts/connectors/endpoints.ts";
export { LlmCallContract, LlmCallSchema, type LlmCall } from "./contracts/usage/llm-call.schema.ts";
// SP4 chat: conversations, chat requests, generative UI props and voice.
export {
  ChatAgentIdSchema,
  ConversationContract,
  ConversationIdSchema,
  ConversationSchema,
  MAX_SEARCH_TOKENS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
  type ChatAgentId,
  type Conversation,
  type ConversationId,
} from "./contracts/conversations/conversation.schema.ts";
export {
  ChatRequestContract,
  ChatRequestSchema,
  ChatTextPartSchema,
  MAX_APPROVAL_REASON_CHARS,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_TEXT_CHARS,
  ToolApprovalResponsePartSchema,
  type ChatRequest,
  type ToolApprovalResponsePart,
} from "./contracts/conversations/chat-request.schema.ts";
export { ConversationPatchContract, ConversationPatchSchema, type ConversationPatch } from "./contracts/conversations/conversation-patch.schema.ts";
export {
  MessageAttachmentSchema,
  MessageMetadataContract,
  MessageMetadataSchema,
  type MessageAttachment,
  type MessageMetadata,
} from "./contracts/conversations/message-metadata.schema.ts";
export { ToolApprovalDecisionContract, ToolApprovalDecisionSchema, type ToolApprovalDecision } from "./contracts/conversations/tool-approval-decision.schema.ts";
export { CHAT_PERMISSIONS } from "./contracts/conversations/chat-permissions.ts";
export {
  ChatStreamSchema,
  ChatUiMessageSchema,
  CONVERSATIONS_ENDPOINTS,
  deleteConversationEndpoint,
  getConversationEndpoint,
  listConversationMessagesEndpoint,
  listConversationsEndpoint,
  ListConversationsQuerySchema,
  resumeChatStreamEndpoint,
  sendChatMessageEndpoint,
  stopChatRunEndpoint,
  summarizeConversationEndpoint,
  updateConversationEndpoint,
} from "./contracts/conversations/endpoints.ts";
export { CHAT_UI_COMPONENTS, CHAT_UI_CONTRACTS } from "./contracts/chat/ui/chat-ui-components.ts";
export { SchemaFormPropsContract, SchemaFormPropsSchema, type SchemaFormProps } from "./contracts/chat/ui/schema-form.schema.ts";
export { DataTablePropsContract, DataTablePropsSchema, MAX_TABLE_ROWS, type DataTableProps } from "./contracts/chat/ui/data-table.schema.ts";
export { ChartPropsContract, ChartPropsSchema, type ChartProps } from "./contracts/chat/ui/chart.schema.ts";
export { ApprovalDiffPropsContract, ApprovalDiffPropsSchema, type ApprovalDiffProps } from "./contracts/chat/ui/approval-diff.schema.ts";
export { PickerPropsContract, PickerPropsSchema, type PickerProps } from "./contracts/chat/ui/picker.schema.ts";
export { ApprovalPendingPropsContract, ApprovalPendingPropsSchema, type ApprovalPendingProps } from "./contracts/chat/ui/approval-pending.schema.ts";
export {
  MAX_SPEECH_TEXT_CHARS,
  RealtimeSessionContract,
  RealtimeSessionSchema,
  SpeechRequestContract,
  SpeechRequestSchema,
  TranscriptionContract,
  TranscriptionSchema,
  type RealtimeSession,
  type SpeechRequest,
  type Transcription,
} from "./contracts/voice/voice.schema.ts";
export { createRealtimeSessionEndpoint, SpeechAudioSchema, synthesizeSpeechEndpoint, transcribeVoiceEndpoint, VOICE_ENDPOINTS } from "./contracts/voice/endpoints.ts";
export { UsageSummaryContract, UsageSummarySchema, type UsageSummary } from "./contracts/usage/usage-summary.schema.ts";
export {
  FileNameSchema,
  FilePurposeSchema,
  FileUploadRequestContract,
  FileUploadRequestSchema,
  MAX_UPLOAD_BYTES,
  type FilePurpose,
  type FileUploadRequest,
} from "./contracts/files/file-upload-request.schema.ts";
export { FileIdSchema, StoredFileContract, StoredFileSchema, type FileId, type StoredFile } from "./contracts/files/stored-file.schema.ts";
export {
  FileReadUrlContract,
  FileReadUrlSchema,
  FileUploadTicketContract,
  FileUploadTicketSchema,
  UploadInstructionsSchema,
  type FileReadUrl,
  type FileUploadTicket,
  type UploadInstructions,
} from "./contracts/files/file-upload-ticket.schema.ts";
export { FILES_ENDPOINTS, getFileEndpoint, getFileReadUrlEndpoint, requestFileUploadEndpoint } from "./contracts/files/endpoints.ts";
// SP1 tenancy.
export { TENANCY_CONTRACTS } from "./contracts/tenancy/contracts.ts";
export {
  OrganizationIdSchema, ProjectIdSchema, UnitIdSchema, type OrganizationId, type ProjectId, type UnitId,
} from "./contracts/tenancy/ids.schema.ts";
export {
  NodeRegionalOverridesSchema, RegionalDefaultsSchema, type NodeRegionalOverrides, type RegionalDefaults,
} from "./contracts/tenancy/regional-defaults.schema.ts";
export {
  NodeNameSchema, ORGANIZATION_EXAMPLE, OrganizationContract, OrganizationSchema, OrganizationStatusSchema,
  type Organization, type OrganizationStatus,
} from "./contracts/tenancy/organization.schema.ts";
export {
  PROJECT_EXAMPLE, ProjectContract, ProjectDescriptionSchema, ProjectSchema, ProjectStatusSchema, type Project,
  type ProjectStatus,
} from "./contracts/tenancy/project.schema.ts";
export {
  MAX_UNIT_DEPTH, UNIT_EXAMPLE, UnitContract, UnitFieldsSchema, UnitSchema, type Unit,
} from "./contracts/tenancy/unit.schema.ts";
export {
  UnitParentKindSchema, UnitTypeDefinitionContract, UnitTypeDefinitionSchema, UnitTypeIdSchema, type UnitParentKind,
  type UnitTypeDefinition, type UnitTypeId,
} from "./contracts/tenancy/unit-type.schema.ts";
export {
  NodeRefContract, NodeRefSchema, TenantNodeRefContract, TenantNodeRefSchema, tenantNodeRefField, type NodeRef,
  type TenantNodeRef,
} from "./contracts/tenancy/node-ref.schema.ts";
export {
  CreateOrganizationInputContract, CreateOrganizationInputSchema, type CreateOrganizationInput,
} from "./contracts/tenancy/create-organization-input.schema.ts";
export {
  UpdateOrganizationInputContract, UpdateOrganizationInputSchema, type UpdateOrganizationInput,
} from "./contracts/tenancy/update-organization-input.schema.ts";
export {
  CreateProjectInputContract, CreateProjectInputSchema, type CreateProjectInput,
} from "./contracts/tenancy/create-project-input.schema.ts";
export {
  NodeRegionalOverridesPatchSchema, UpdateProjectInputContract, UpdateProjectInputSchema, type UpdateProjectInput,
} from "./contracts/tenancy/update-project-input.schema.ts";
export { CreateUnitInputContract, CreateUnitInputSchema, type CreateUnitInput } from "./contracts/tenancy/create-unit-input.schema.ts";
export { UpdateUnitInputContract, UpdateUnitInputSchema, type UpdateUnitInput } from "./contracts/tenancy/update-unit-input.schema.ts";
export {
  RegionalSettingsContract, RegionalSettingsSchema, type RegionalSettings,
} from "./contracts/tenancy/regional-settings.schema.ts";
export {
  createOrganizationEndpoint, createProjectEndpoint, createUnitEndpoint, deleteOrganizationEndpoint, deleteProjectEndpoint,
  deleteUnitEndpoint, getOrganizationEndpoint, getProjectEndpoint, getUnitEndpoint, listProjectsEndpoint, listUnitsEndpoint,
  listUnitTypesEndpoint, OrganizationParamsSchema, TENANCY_ENDPOINTS, updateOrganizationEndpoint, updateProjectEndpoint,
  updateUnitEndpoint,
} from "./contracts/tenancy/endpoints.ts";
// SP1 identity.
export { IDENTITY_CONTRACTS } from "./contracts/identity/contracts.ts";
export {
  ApiKeyIdSchema, DeviceActivationIdSchema, DeviceIdSchema, ImpersonationSessionIdSchema, SessionIdSchema, type ApiKeyId,
  type DeviceActivationId, type DeviceId, type ImpersonationSessionId, type SessionId,
} from "./contracts/identity/ids.schema.ts";
export {
  PrincipalContract, PrincipalSchema, type DevicePrincipal, type Principal, type ServicePrincipal, type UserPrincipal,
} from "./contracts/identity/principal.schema.ts";
export {
  DEFAULT_USER_PREFERENCES, NotificationPreferencesSchema, ThemeSchema, UserPreferencesContract, UserPreferencesSchema,
  type NotificationPreferences, type Theme, type UserPreferences,
} from "./contracts/identity/user-preferences.schema.ts";
export {
  DisplayNameSchema, LastContextSchema, UserContract, UserSchema, UserStatusSchema, type LastContext, type User,
  type UserStatus,
} from "./contracts/identity/user.schema.ts";
export { MeContract, MeSchema, type Me } from "./contracts/identity/me.schema.ts";
export { UpdateMeInputContract, UpdateMeInputSchema, type UpdateMeInput } from "./contracts/identity/update-me-input.schema.ts";
export {
  SetActiveOrganizationInputContract, SetActiveOrganizationInputSchema, type SetActiveOrganizationInput,
} from "./contracts/identity/active-organization-input.schema.ts";
export {
  SessionKindSchema, SessionSummaryContract, SessionSummarySchema, type SessionKind, type SessionSummary,
} from "./contracts/identity/session.schema.ts";
export {
  CreateDesktopSessionResponseContract, CreateDesktopSessionResponseSchema, CustomTokenSchema, DesktopSessionSecretSchema,
  ExchangeDesktopSessionInputContract, ExchangeDesktopSessionInputSchema, ExchangeDesktopSessionResponseContract,
  ExchangeDesktopSessionResponseSchema, type CreateDesktopSessionResponse, type ExchangeDesktopSessionInput,
  type ExchangeDesktopSessionResponse,
} from "./contracts/identity/desktop-session.schema.ts";
export {
  DeviceContract, DeviceLabelSchema, DeviceSchema, DeviceStatusSchema, type Device, type DeviceStatus,
} from "./contracts/identity/device.schema.ts";
export {
  API_KEY_MAX_LIFETIME_DAYS, API_KEY_MAX_SCOPES, ApiKeyContract, apiKeyExpiryIssue, ApiKeyNameSchema, ApiKeyPublicIdSchema,
  ApiKeyRevokedReasonSchema, ApiKeySchema, ApiKeyStatusSchema, CreateApiKeyInputContract, CreateApiKeyInputSchema,
  CreateApiKeyResponseContract, CreateApiKeyResponseSchema, type ApiKey, type ApiKeyExpiryIssue, type ApiKeyRevokedReason,
  type ApiKeyStatus, type CreateApiKeyInput, type CreateApiKeyResponse,
} from "./contracts/identity/api-key.schema.ts";
export {
  PLATFORM_ROLES, PlatformRoleSchema, PlatformStaffContract, PlatformStaffSchema, type PlatformRole, type PlatformStaff,
} from "./contracts/identity/platform-staff.schema.ts";
export {
  ImpersonationSessionContract, ImpersonationSessionSchema, MAX_IMPERSONATION_MINUTES, StartImpersonationInputContract,
  StartImpersonationInputSchema, StartImpersonationResponseContract, StartImpersonationResponseSchema,
  type ImpersonationSession, type StartImpersonationInput, type StartImpersonationResponse,
} from "./contracts/identity/impersonation-session.schema.ts";
export {
  createApiKeyEndpoint, createDesktopSessionEndpoint, exchangeDesktopSessionEndpoint, getMeEndpoint, IDENTITY_ENDPOINTS,
  listApiKeysEndpoint, listDevicesEndpoint, listMyOrganizationsEndpoint, listSessionsEndpoint, revokeAllSessionsEndpoint,
  revokeApiKeyEndpoint, revokeDeviceEndpoint, revokeSessionEndpoint, setActiveOrganizationEndpoint, syncClaimsEndpoint,
  updateMeEndpoint,
} from "./contracts/identity/endpoints.ts";
export {
  createDeviceActivationEndpoint, endImpersonationEndpoint, getAccessContextEndpoint, listMyGrantsEndpoint, redeemDeviceActivationEndpoint,
  startImpersonationEndpoint,
} from "./contracts/identity/endpoints.ts";
export {
  CreateDeviceActivationInputContract, CreateDeviceActivationInputSchema, CreateDeviceActivationResponseContract,
  CreateDeviceActivationResponseSchema, DEVICE_ACTIVATION_TTL_MINUTES, DeviceActivationCodeInputSchema,
  DeviceActivationCodeSchema, RedeemDeviceActivationInputContract, RedeemDeviceActivationInputSchema,
  RedeemDeviceActivationResponseContract, RedeemDeviceActivationResponseSchema, type CreateDeviceActivationInput,
  type CreateDeviceActivationResponse, type RedeemDeviceActivationInput, type RedeemDeviceActivationResponse,
} from "./contracts/identity/device-activation.schema.ts";
// SP1 access.
export { ACCESS_CONTRACTS } from "./contracts/access/contracts.ts";
export { OWNER_ONLY_PERMISSION, SYSTEM_ROLE_KEYS, SystemRoleKeySchema, type SystemRoleKey } from "./contracts/access/system-roles.ts";
export {
  PermissionDefinitionContract, PermissionDefinitionSchema, PermissionKindSchema, PermissionScopeSchema,
  type PermissionDefinition, type PermissionKind, type PermissionScope,
} from "./contracts/access/permission-definition.schema.ts";
export { CORE_PERMISSIONS, SP1_PERMISSIONS } from "./contracts/access/core-permissions.ts";
export {
  MAX_ROLES_PER_GRANT, RoleIdSchema, RoleRefContract, RoleRefListSchema, RoleRefSchema, roleRefKey, roleRefsField,
  type RoleId, type RoleRef,
} from "./contracts/access/role-ref.schema.ts";
export {
  MAX_ROLE_PERMISSIONS, ROLE_EXAMPLE, RoleContract, RoleDescriptionSchema, RoleNameSchema, rolePermissionsField, RoleSchema,
  type Role,
} from "./contracts/access/role.schema.ts";
export { CreateRoleInputContract, CreateRoleInputSchema, type CreateRoleInput } from "./contracts/access/create-role-input.schema.ts";
export { UpdateRoleInputContract, UpdateRoleInputSchema, type UpdateRoleInput } from "./contracts/access/update-role-input.schema.ts";
export {
  GrantPrincipalTypeSchema, MEMBERSHIP_EXAMPLE, MembershipContract, MembershipIdSchema, MembershipSchema,
  type GrantPrincipalType, type Membership, type MembershipId,
} from "./contracts/access/membership.schema.ts";
export {
  GrantMembershipInputContract, GrantMembershipInputSchema, type GrantMembershipInput,
} from "./contracts/access/grant-membership-input.schema.ts";
export {
  UpdateMembershipInputContract, UpdateMembershipInputSchema, type UpdateMembershipInput,
} from "./contracts/access/update-membership-input.schema.ts";
export { MemberContract, MemberSchema, type Member } from "./contracts/access/member.schema.ts";
export {
  AccessProjectionContract, accessProjectionId, AccessProjectionSchema, type AccessProjection,
} from "./contracts/access/access-projection.schema.ts";
export {
  AccessContextContract, AccessContextQuerySchema, AccessContextSchema, type AccessContext, type AccessContextQuery,
} from "./contracts/access/access-context.schema.ts";
export {
  MyGrantContract, MyGrantSchema, MyGrantsQuerySchema, type MyGrant, type MyGrantsQuery,
} from "./contracts/access/my-grant.schema.ts";
export {
  AcceptInvitationResponseContract, AcceptInvitationResponseSchema, CreateInvitationInputContract,
  CreateInvitationInputSchema, CreateInvitationResponseContract, CreateInvitationResponseSchema, INVITATION_TTL_DAYS,
  InvitationContract, InvitationIdSchema, InvitationPreviewContract, InvitationPreviewSchema, InvitationSchema,
  InvitationStatusSchema, InvitationTokenInputContract, InvitationTokenInputSchema, InvitationTokenSchema,
  type AcceptInvitationResponse, type CreateInvitationInput, type CreateInvitationResponse, type Invitation,
  type InvitationId, type InvitationPreview, type InvitationStatus, type InvitationTokenInput,
} from "./contracts/access/invitation.schema.ts";
export {
  APPROVAL_STATUSES, APPROVAL_TTL_DAYS, ApprovalActionKindSchema, ApprovalRequestContract, ApprovalRequesterSchema,
  ApprovalRequestIdSchema, ApprovalRequestSchema, ApprovalStatusSchema, CreateApprovalRequestInputContract,
  CreateApprovalRequestInputSchema, DecideApprovalRequestInputContract, DecideApprovalRequestInputSchema,
  type ApprovalRequest, type ApprovalRequestId, type ApprovalStatus, type CreateApprovalRequestInput,
  type DecideApprovalRequestInput,
} from "./contracts/access/approval-request.schema.ts";
export {
  ACCESS_ENDPOINTS, acceptInvitationEndpoint, approveApprovalRequestEndpoint, createApprovalRequestEndpoint,
  createInvitationEndpoint, createRoleEndpoint, deleteRoleEndpoint, getRoleEndpoint, grantMembershipEndpoint,
  listApprovalRequestsEndpoint, listInvitationsEndpoint, listMembersEndpoint, listMembershipsEndpoint,
  listPermissionsEndpoint, listRolesEndpoint, previewInvitationEndpoint, rejectApprovalRequestEndpoint,
  removeMemberEndpoint, revokeInvitationEndpoint, revokeMembershipEndpoint, updateMembershipEndpoint, updateRoleEndpoint,
} from "./contracts/access/endpoints.ts";
// SP1 audit.
export { AUDIT_CONTRACTS } from "./contracts/audit/contracts.ts";
export { AUDIT_ACTIONS, AuditActionSchema, type AuditAction } from "./contracts/audit/audit-action.schema.ts";
export {
  AuditActorSchema, AuditActorTypeSchema, AuditLogEntryContract, AuditLogEntryIdSchema, AuditLogEntrySchema,
  AuditMetadataSchema, AuditOutcomeSchema, AuditTargetSchema, ChangedFieldSchema, PlatformAuditLogEntryContract,
  PlatformAuditLogEntrySchema, type AuditActorType, type AuditLogEntry, type AuditLogEntryId, type AuditMetadata,
  type AuditOutcome, type PlatformAuditLogEntry,
} from "./contracts/audit/audit-log-entry.schema.ts";
export { AuditLogQueryContract, AuditLogQuerySchema, type AuditLogQuery } from "./contracts/audit/audit-log-query.schema.ts";
export { AUDIT_ENDPOINTS, listAuditLogsEndpoint } from "./contracts/audit/endpoints.ts";
export { CORE_ERROR_CODES, CoreErrorCodeSchema, type CoreErrorCode } from "./contracts/http/error-codes.ts";
export { none, personal, sensitive, type FieldDocs } from "./contracts/field-docs.ts";
export { HAS_ANY_FIELD_ERROR, hasAnyField, hasUniqueItems } from "./contracts/primitives/refinements.ts";
// Removable sample contract (keeps the catalog non-empty).
export { NoteContract, NoteIdSchema, NoteSchema, type Note, type NoteId } from "./contracts/example/note.schema.ts";
// SP2 module contract and module settings (decision 0015).
export { CapabilityRefSchema, type CapabilityRef } from "./contracts/modules/capability-ref.schema.ts";
export { defineModule } from "./contracts/modules/define-module.ts";
export { ModuleDefinitionError, type ModuleDefinitionErrorCode } from "./contracts/modules/module-definition-error.ts";
export {
  CAPABILITY_KINDS, ModuleIdSchema, ModuleManifestSchema, ModuleSettingsDefinitionSchema, RESERVED_MODULE_IDS,
  type CapabilityKind, type ModuleId, type ModuleManifest, type ModuleSettingsManifest,
} from "./contracts/modules/module-manifest.schema.ts";
export {
  ModuleSettingsContract, ModuleSettingsSchema, ModuleSettingsValuesSchema, type ModuleSettings, type ModuleSettingsValues,
} from "./contracts/modules/module-settings.schema.ts";
export {
  getModuleSettingsEndpoint, MODULES_ENDPOINTS, ModuleSettingsParamsSchema, updateModuleSettingsEndpoint,
} from "./contracts/modules/endpoints.ts";
export { NAV_SLOTS, NavItemSchema, NavSlotSchema, type NavItem, type NavSlot } from "./contracts/modules/nav-item.schema.ts";
// SP5 workflows, prompts, platform console and observability.
export { SP5_CONTRACTS } from "./contracts/sp5-contracts.ts";
export { SP5_PERMISSIONS } from "./contracts/access/core-permissions.ts";
export {
  HUMAN_APPROVAL_DECISIONS, HumanApprovalDecisionSchema, HumanApprovalResumeContract, HumanApprovalResumeSchema,
  HumanApprovalSuspendSchema, WORKFLOW_RESUME_ACTION_KIND, WorkflowIdSchema, WorkflowResumeActionInputContract,
  WorkflowResumeActionInputSchema, type HumanApprovalDecision, type HumanApprovalResume, type HumanApprovalSuspend,
  type WorkflowResumeActionInput,
} from "./contracts/workflows/human-approval-resume.schema.ts";
export {
  CreateScheduleInputContract, CreateScheduleInputSchema, CronExpressionSchema, ScheduleContract, ScheduleSchema,
  ScheduleSlugSchema, ScheduleStatusSchema, UpdateScheduleInputContract, UpdateScheduleInputSchema,
  type CreateScheduleInput, type Schedule, type ScheduleStatus, type UpdateScheduleInput,
} from "./contracts/workflows/schedule.schema.ts";
export {
  StartWorkflowRunInputContract, StartWorkflowRunInputSchema, WORKFLOW_RUN_STATUSES, WorkflowRunContract, WorkflowRunSchema,
  WorkflowRunStatusSchema, type StartWorkflowRunInput, type WorkflowRun, type WorkflowRunStatus,
} from "./contracts/workflows/workflow-run.schema.ts";
export {
  WORKFLOW_EVENT_TYPES, WorkflowEventContract, WorkflowEventSchema, WorkflowEventTypeSchema, type WorkflowEvent,
} from "./contracts/workflows/workflow-event.schema.ts";
export {
  CreatePromptVersionInputContract, CreatePromptVersionInputSchema, PromptScopeSchema, PromptVersionContract,
  PromptVersionIdSchema, PromptVersionSchema, type CreatePromptVersionInput, type PromptScope, type PromptVersion,
  type PromptVersionId,
} from "./contracts/agents/prompt-version.schema.ts";
export {
  ActivatePromptVersionInputContract, ActivatePromptVersionInputSchema, PromptActivationContract, PromptActivationSchema,
  type ActivatePromptVersionInput, type PromptActivation,
} from "./contracts/agents/prompt-activation.schema.ts";
export {
  PlanContract, PlanIdSchema, PlanLimitsSchema, PlanSchema, UpsertPlanInputContract, UpsertPlanInputSchema,
  type Plan, type PlanId, type PlanLimits, type UpsertPlanInput,
} from "./contracts/platform/plan.schema.ts";
export {
  FeatureFlagContract, FeatureFlagDefinitionContract, FeatureFlagDefinitionSchema, FeatureFlagKeySchema,
  FeatureFlagKindSchema, FeatureFlagSchema, SetFeatureFlagValueInputContract, SetFeatureFlagValueInputSchema,
  type FeatureFlag, type FeatureFlagDefinition, type FeatureFlagKind, type SetFeatureFlagValueInput,
} from "./contracts/platform/feature-flag.schema.ts";
export { AdminOverviewContract, AdminOverviewSchema, type AdminOverview } from "./contracts/platform/admin-overview.schema.ts";
export {
  SpanIdSchema, TraceIdSchema, TraceStatusSchema, TraceSummaryContract, TraceSummarySchema, type TraceSummary,
} from "./contracts/observability/trace-summary.schema.ts";
export {
  TraceDetailContract, TraceDetailSchema, TraceSpanSchema, type TraceDetail, type TraceSpan,
} from "./contracts/observability/trace-detail.schema.ts";
export {
  EvalExperimentSummaryContract, EvalExperimentSummarySchema, type EvalExperimentSummary,
} from "./contracts/observability/eval-experiment-summary.schema.ts";
export { UsageDailyRollupContract, UsageDailyRollupSchema, type UsageDailyRollup } from "./contracts/usage/usage-daily-rollup.schema.ts";
export {
  MessageFeedbackContract, MessageFeedbackInputContract, MessageFeedbackInputSchema, MessageFeedbackSchema,
  MessageRatingSchema, type MessageFeedback, type MessageFeedbackInput,
} from "./contracts/conversations/message-feedback.schema.ts";
export {
  cancelWorkflowRunEndpoint, getWorkflowRunEndpoint, listWorkflowRunsEndpoint, OrganizationQuerySchema, StartedWorkflowRunSchema,
  startWorkflowRunEndpoint, streamWorkflowRunEndpoint, WORKFLOW_RUN_ENDPOINTS, WorkflowRunStreamSchema,
} from "./contracts/workflows/endpoints.ts";
export {
  createScheduleEndpoint, deleteScheduleEndpoint, getScheduleEndpoint, listSchedulesEndpoint, pauseScheduleEndpoint, resumeScheduleEndpoint,
  runScheduleNowEndpoint, SCHEDULE_ENDPOINTS, ScheduleRunQueuedSchema, updateScheduleEndpoint,
} from "./contracts/workflows/endpoints.ts";
export {
  adminClearFlagOverrideEndpoint, adminListFlagsEndpoint, adminSetFlagEndpoint, FLAG_ENDPOINTS, listFlagsEndpoint, setTenantFlagEndpoint,
} from "./contracts/platform/flag-endpoints.ts";
export {
  TenantFlagValueInputContract, TenantFlagValueInputSchema, type TenantFlagValueInput,
} from "./contracts/platform/feature-flag.schema.ts";
export { SP5_ADMIN_ENDPOINTS } from "./contracts/sp5-admin-endpoints.ts";
export {
  BudgetCapsSchema, BudgetSourceSchema, OrganizationAdminDetailContract, OrganizationAdminDetailSchema, OrganizationAdminSummaryContract, OrganizationAdminSummarySchema, SetTenantBudgetInputContract,
  SetTenantBudgetInputSchema, UpdateOrganizationAdminInputContract, UpdateOrganizationAdminInputSchema, type BudgetCaps,
  type OrganizationAdminDetail, type OrganizationAdminSummary, type SetTenantBudgetInput, type UpdateOrganizationAdminInput,
} from "./contracts/platform/organization-admin.schema.ts";
export {
  UpdateAgentSettingsInputContract, UpdateAgentSettingsInputSchema, type UpdateAgentSettingsInput,
} from "./contracts/agents/update-agent-settings.schema.ts";
export {
  ADMIN_PLATFORM_ENDPOINTS, createPlanEndpoint, getAdminOverviewEndpoint, getAgentSettingsEndpoint, getOrganizationAdminEndpoint, getOrganizationAgentSettingsEndpoint,
  listOrganizationsAdminEndpoint, listPlansEndpoint, setOrganizationBudgetEndpoint, updateAgentSettingsEndpoint,
  updateOrganizationAdminEndpoint, updateOrganizationAgentSettingsEndpoint, updatePlanEndpoint,
} from "./contracts/platform/admin-endpoints.ts";
export {
  PROMPT_AGENT_IDS, PromptAgentIdSchema, PromptEvalResultContract, PromptEvalResultSchema, type PromptAgentId, type PromptEvalResult,
} from "./contracts/agents/prompt-eval.schema.ts";
export {
  activateAddendumEndpoint, adminActivatePromptEndpoint, adminCreatePromptVersionEndpoint, adminEvaluatePromptVersionEndpoint,
  adminListPromptActivationsEndpoint, adminListPromptVersionsEndpoint, createAddendumVersionEndpoint, evaluateAddendumVersionEndpoint,
  listAddendumActivationsEndpoint, listAddendumVersionsEndpoint, PROMPT_ENDPOINTS,
} from "./contracts/agents/prompt-endpoints.ts";
export {
  EvalDatasetContract, EvalDatasetSchema, StartEvalExperimentInputContract, StartEvalExperimentInputSchema, type EvalDataset,
  type StartEvalExperimentInput,
} from "./contracts/observability/eval-dataset.schema.ts";
export {
  adminGetTraceEndpoint, adminListDatasetsEndpoint, adminListExperimentsEndpoint, adminListTracesEndpoint, getTraceEndpoint,
  listEvalDatasetsEndpoint, listEvalExperimentsEndpoint, listTracesEndpoint, OBSERVABILITY_ENDPOINTS, recordMessageFeedbackEndpoint,
  startEvalExperimentEndpoint,
} from "./contracts/observability/endpoints.ts";
// SP5 staff console operations (decision 0043): runs, schedules, connectors and local logs for `/admin`.
export {
  ADMIN_OPERATIONS_ENDPOINTS, adminCancelWorkflowRunEndpoint, adminListConnectorsEndpoint, adminListLogsEndpoint, adminListSchedulesEndpoint,
  adminListWorkflowRunsEndpoint, adminPauseScheduleEndpoint, adminResumeScheduleEndpoint, adminRunScheduleNowEndpoint,
} from "./contracts/platform/admin-operations-endpoints.ts";
export {
  AdminScheduleContract, AdminScheduleSchema, AdminWorkflowRunContract, AdminWorkflowRunSchema, LogLevelSchema, LogLineContract, LogLineSchema,
  type AdminSchedule, type AdminWorkflowRun, type LogLine, type LogLineLevel,
} from "./contracts/platform/admin-operations.schema.ts";
// SP5 admin gaps (decision 0044): staff user search and batched name lookup.
export { ADMIN_USER_ENDPOINTS, adminListUsersEndpoint } from "./contracts/platform/admin-user-endpoints.ts";
export {
  ADMIN_USER_LOOKUP_MAX, AdminUserSearchBySchema, AdminUserSummaryContract, AdminUserSummarySchema,
  type AdminUserSearchBy, type AdminUserSummary,
} from "./contracts/platform/admin-user.schema.ts";
