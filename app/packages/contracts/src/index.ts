// Public API of @core/contracts. Explicit named re-exports only (no `export *`).

export { CORE_CONTRACTS, CORE_ENDPOINTS, composeCoreContracts, composeCoreEndpoints } from "./composition.ts";
export {
  type AccessContext,
  AccessContextContract,
  type AccessContextQuery,
  AccessContextQuerySchema,
  AccessContextSchema,
} from "./contracts/access/access-context.schema.ts";
export {
  type AccessProjection,
  AccessProjectionContract,
  AccessProjectionSchema,
  accessProjectionId,
} from "./contracts/access/access-projection.schema.ts";
export {
  APPROVAL_STATUSES,
  APPROVAL_TTL_DAYS,
  ApprovalActionKindSchema,
  type ApprovalFailure,
  ApprovalFailureCodeSchema,
  ApprovalFailureSchema,
  type ApprovalRequest,
  ApprovalRequestContract,
  ApprovalRequesterSchema,
  type ApprovalRequestId,
  ApprovalRequestIdSchema,
  ApprovalRequestSchema,
  type ApprovalStatus,
  ApprovalStatusSchema,
  type CreateApprovalRequestInput,
  CreateApprovalRequestInputContract,
  CreateApprovalRequestInputSchema,
  type DecideApprovalRequestInput,
  DecideApprovalRequestInputContract,
  DecideApprovalRequestInputSchema,
} from "./contracts/access/approval-request.schema.ts";
// SP1 access.
export { ACCESS_CONTRACTS } from "./contracts/access/contracts.ts";
export { CORE_PERMISSIONS, SP1_PERMISSIONS, SP5_PERMISSIONS } from "./contracts/access/core-permissions.ts";
export {
  type CreateRoleInput,
  CreateRoleInputContract,
  CreateRoleInputSchema,
} from "./contracts/access/create-role-input.schema.ts";
export {
  ACCESS_ENDPOINTS,
  acceptInvitationEndpoint,
  approveApprovalRequestEndpoint,
  createApprovalRequestEndpoint,
  createInvitationEndpoint,
  createRoleEndpoint,
  deleteRoleEndpoint,
  getApprovalRequestEndpoint,
  getRoleEndpoint,
  grantMembershipEndpoint,
  listApprovalRequestsEndpoint,
  listInvitationsEndpoint,
  listMembersEndpoint,
  listMembershipsEndpoint,
  listPermissionsEndpoint,
  listRolesEndpoint,
  previewInvitationEndpoint,
  rejectApprovalRequestEndpoint,
  removeMemberEndpoint,
  revokeInvitationEndpoint,
  revokeMembershipEndpoint,
  updateMembershipEndpoint,
  updateRoleEndpoint,
} from "./contracts/access/endpoints.ts";
export {
  type GrantMembershipInput,
  GrantMembershipInputContract,
  GrantMembershipInputSchema,
} from "./contracts/access/grant-membership-input.schema.ts";
export {
  type AcceptInvitationResponse,
  AcceptInvitationResponseContract,
  AcceptInvitationResponseSchema,
  type CreateInvitationInput,
  CreateInvitationInputContract,
  CreateInvitationInputSchema,
  type CreateInvitationResponse,
  CreateInvitationResponseContract,
  CreateInvitationResponseSchema,
  INVITATION_TTL_DAYS,
  type Invitation,
  InvitationContract,
  type InvitationId,
  InvitationIdSchema,
  type InvitationPreview,
  InvitationPreviewContract,
  InvitationPreviewSchema,
  InvitationSchema,
  type InvitationStatus,
  InvitationStatusSchema,
  type InvitationTokenInput,
  InvitationTokenInputContract,
  InvitationTokenInputSchema,
  InvitationTokenSchema,
} from "./contracts/access/invitation.schema.ts";
export { type Member, MemberContract, MemberSchema } from "./contracts/access/member.schema.ts";
export {
  type GrantPrincipalType,
  GrantPrincipalTypeSchema,
  MEMBERSHIP_EXAMPLE,
  type Membership,
  MembershipContract,
  type MembershipId,
  MembershipIdSchema,
  MembershipSchema,
} from "./contracts/access/membership.schema.ts";
export {
  type MyGrant,
  MyGrantContract,
  MyGrantSchema,
  type MyGrantsQuery,
  MyGrantsQuerySchema,
} from "./contracts/access/my-grant.schema.ts";
export {
  type PermissionDefinition,
  PermissionDefinitionContract,
  PermissionDefinitionSchema,
  type PermissionKind,
  PermissionKindSchema,
  type PermissionScope,
  PermissionScopeSchema,
} from "./contracts/access/permission-definition.schema.ts";
export {
  MAX_ROLE_PERMISSIONS,
  ROLE_EXAMPLE,
  type Role,
  RoleContract,
  RoleDescriptionSchema,
  RoleNameSchema,
  RoleSchema,
  rolePermissionsField,
} from "./contracts/access/role.schema.ts";
export {
  MAX_ROLES_PER_GRANT,
  type RoleId,
  RoleIdSchema,
  type RoleRef,
  RoleRefContract,
  RoleRefListSchema,
  RoleRefSchema,
  roleRefKey,
  roleRefsField,
} from "./contracts/access/role-ref.schema.ts";
export {
  OWNER_ONLY_PERMISSION,
  SYSTEM_ROLE_KEYS,
  type SystemRoleKey,
  SystemRoleKeySchema,
} from "./contracts/access/system-roles.ts";
export {
  type UpdateMembershipInput,
  UpdateMembershipInputContract,
  UpdateMembershipInputSchema,
} from "./contracts/access/update-membership-input.schema.ts";
export {
  type UpdateRoleInput,
  UpdateRoleInputContract,
  UpdateRoleInputSchema,
} from "./contracts/access/update-role-input.schema.ts";
export {
  type AgentCatalogEntry,
  AgentCatalogEntryContract,
  AgentCatalogEntrySchema,
  type AgentCatalogSkill,
  AgentCatalogSkillSchema,
  type AgentCatalogTool,
  AgentCatalogToolSchema,
} from "./contracts/agents/agent-catalog.schema.ts";
// SP3 agent runtime contracts.
export { AGENT_PERMISSIONS, type AgentPermissionDefinition } from "./contracts/agents/agent-permissions.ts";
export {
  type AgentRequestContext,
  AgentRequestContextContract,
  AgentRequestContextSchema,
} from "./contracts/agents/agent-request-context.schema.ts";
export {
  type AgentKey,
  AgentKeySchema,
  type AgentSettings,
  AgentSettingsContract,
  AgentSettingsSchema,
} from "./contracts/agents/agent-settings.schema.ts";
export {
  AGENT_COMMAND_ACTION_KIND,
  type AgentApprovalRequest,
  AgentApprovalRequestContract,
  AgentApprovalRequestSchema,
} from "./contracts/agents/approval-request.schema.ts";
export {
  type CreateCustomAgentInput,
  CreateCustomAgentInputContract,
  CreateCustomAgentInputSchema,
  CUSTOM_AGENT_KNOWLEDGE_SCOPES,
  CUSTOM_AGENT_MODELS,
  CUSTOM_AGENT_RUNTIME_ID,
  type CustomAgent,
  CustomAgentContract,
  type CustomAgentId,
  CustomAgentIdSchema,
  type CustomAgentKnowledgeScope,
  CustomAgentKnowledgeScopeSchema,
  type CustomAgentModel,
  CustomAgentModelSchema,
  CustomAgentSchema,
  EXAMPLE_CUSTOM_AGENT_ID,
  MAX_CUSTOM_AGENT_SKILLS,
  MAX_CUSTOM_AGENT_TOOLS,
  type UpdateCustomAgentInput,
  UpdateCustomAgentInputContract,
  UpdateCustomAgentInputSchema,
} from "./contracts/agents/custom-agent.schema.ts";
export {
  type ChatAgentOption,
  ChatAgentOptionContract,
  ChatAgentOptionSchema,
  CUSTOM_AGENT_LIMIT_DEFAULTS,
  type CustomAgentLimits,
  CustomAgentLimitsSchema,
  type CustomAgentOptions,
  CustomAgentOptionsContract,
  CustomAgentOptionsSchema,
  type CustomAgentRuntimeOptions,
  CustomAgentRuntimeOptionsSchema,
} from "./contracts/agents/custom-agent-options.schema.ts";
export {
  CUSTOM_AGENT_CONTRACTS,
  CUSTOM_AGENT_ENDPOINTS,
  createCustomAgentEndpoint,
  createCustomSkillEndpoint,
  deleteCustomAgentEndpoint,
  deleteCustomSkillEndpoint,
  getCustomAgentEndpoint,
  getCustomAgentOptionsEndpoint,
  getCustomSkillEndpoint,
  listChatAgentsEndpoint,
  listCustomSkillsEndpoint,
  updateCustomAgentEndpoint,
  updateCustomSkillEndpoint,
} from "./contracts/agents/custom-endpoints.ts";
// Tenant-defined agents and skills (decision 0046).
export {
  type CreateCustomSkillInput,
  CreateCustomSkillInputContract,
  CreateCustomSkillInputSchema,
  type CustomSkill,
  CustomSkillContract,
  type CustomSkillId,
  CustomSkillIdSchema,
  CustomSkillNameSchema,
  CustomSkillSchema,
  EXAMPLE_CUSTOM_SKILL_ID,
  MAX_CUSTOM_INSTRUCTION_CHARS,
  type UpdateCustomSkillInput,
  UpdateCustomSkillInputContract,
  UpdateCustomSkillInputSchema,
} from "./contracts/agents/custom-skill.schema.ts";
export {
  AGENTS_ENDPOINTS,
  callMcpEndpoint,
  McpMessageSchema,
  McpResponseSchema,
} from "./contracts/agents/endpoints.ts";
export {
  ACTIVE_SCREEN_MAX_LENGTH,
  FORWARDED_HEADERS,
  type ForwardedHeaderName,
} from "./contracts/agents/forwarded-headers.ts";
export {
  type ActivatePromptVersionInput,
  ActivatePromptVersionInputContract,
  ActivatePromptVersionInputSchema,
  type PromptActivation,
  PromptActivationContract,
  PromptActivationSchema,
} from "./contracts/agents/prompt-activation.schema.ts";
export {
  activateAddendumEndpoint,
  adminActivatePromptEndpoint,
  adminCreatePromptVersionEndpoint,
  adminEvaluatePromptVersionEndpoint,
  adminGetPromptSeedEndpoint,
  adminListPromptActivationsEndpoint,
  adminListPromptVersionsEndpoint,
  createAddendumVersionEndpoint,
  evaluateAddendumVersionEndpoint,
  listAddendumActivationsEndpoint,
  listAddendumVersionsEndpoint,
  PROMPT_ENDPOINTS,
} from "./contracts/agents/prompt-endpoints.ts";
export {
  PROMPT_AGENT_IDS,
  type PromptAgentId,
  PromptAgentIdSchema,
  type PromptEvalResult,
  PromptEvalResultContract,
  PromptEvalResultSchema,
  type PromptSeed,
  PromptSeedContract,
  PromptSeedSchema,
} from "./contracts/agents/prompt-eval.schema.ts";
export {
  type CreatePromptVersionInput,
  CreatePromptVersionInputContract,
  CreatePromptVersionInputSchema,
  type PromptScope,
  PromptScopeSchema,
  type PromptVersion,
  PromptVersionContract,
  type PromptVersionId,
  PromptVersionIdSchema,
  PromptVersionSchema,
} from "./contracts/agents/prompt-version.schema.ts";
export { type ToolUi, ToolUiContract, ToolUiSchema } from "./contracts/agents/tool-ui.schema.ts";
export {
  type UpdateAgentSettingsInput,
  UpdateAgentSettingsInputContract,
  UpdateAgentSettingsInputSchema,
} from "./contracts/agents/update-agent-settings.schema.ts";
export { AUDIT_ACTIONS, type AuditAction, AuditActionSchema } from "./contracts/audit/audit-action.schema.ts";
export {
  AuditActorSchema,
  type AuditActorType,
  AuditActorTypeSchema,
  type AuditLogEntry,
  AuditLogEntryContract,
  type AuditLogEntryId,
  AuditLogEntryIdSchema,
  AuditLogEntrySchema,
  type AuditMetadata,
  AuditMetadataSchema,
  type AuditOutcome,
  AuditOutcomeSchema,
  AuditTargetSchema,
  ChangedFieldSchema,
  type PlatformAuditLogEntry,
  PlatformAuditLogEntryContract,
  PlatformAuditLogEntrySchema,
} from "./contracts/audit/audit-log-entry.schema.ts";
export {
  type AuditLogQuery,
  AuditLogQueryContract,
  AuditLogQuerySchema,
  type PlatformAuditLogQuery,
  PlatformAuditLogQueryContract,
  PlatformAuditLogQuerySchema,
} from "./contracts/audit/audit-log-query.schema.ts";
// SP1 audit.
export { AUDIT_CONTRACTS } from "./contracts/audit/contracts.ts";
export { AUDIT_ENDPOINTS, listAuditLogsEndpoint, listPlatformAuditLogsEndpoint } from "./contracts/audit/endpoints.ts";
export {
  type ApprovalDiffProps,
  ApprovalDiffPropsContract,
  ApprovalDiffPropsSchema,
} from "./contracts/chat/ui/approval-diff.schema.ts";
export {
  type ApprovalPendingProps,
  ApprovalPendingPropsContract,
  ApprovalPendingPropsSchema,
} from "./contracts/chat/ui/approval-pending.schema.ts";
export { type ChartProps, ChartPropsContract, ChartPropsSchema } from "./contracts/chat/ui/chart.schema.ts";
export { CHAT_UI_COMPONENTS, CHAT_UI_CONTRACTS } from "./contracts/chat/ui/chat-ui-components.ts";
export {
  type DataTableProps,
  DataTablePropsContract,
  DataTablePropsSchema,
  MAX_TABLE_ROWS,
} from "./contracts/chat/ui/data-table.schema.ts";
export { type PickerProps, PickerPropsContract, PickerPropsSchema } from "./contracts/chat/ui/picker.schema.ts";
export {
  type SchemaFormProps,
  SchemaFormPropsContract,
  SchemaFormPropsSchema,
} from "./contracts/chat/ui/schema-form.schema.ts";
export {
  AllowedHostSchema,
  CONNECTOR_LOAD_ERROR_CODES,
  type Connector,
  ConnectorContract,
  type ConnectorId,
  ConnectorIdSchema,
  type ConnectorLoadError,
  type ConnectorLoadErrorCode,
  ConnectorLoadErrorCodeSchema,
  ConnectorLoadErrorSchema,
  ConnectorSchema,
  type ConnectorType,
  connectorNeedsSecret,
} from "./contracts/connectors/connector.schema.ts";
export {
  type CreateConnectorInput,
  CreateConnectorInputContract,
  CreateConnectorInputSchema,
  type SetConnectorSecretInput,
  SetConnectorSecretInputContract,
  SetConnectorSecretInputSchema,
  type UpdateConnectorInput,
  UpdateConnectorInputContract,
  UpdateConnectorInputSchema,
} from "./contracts/connectors/connector-input.schema.ts";
export {
  ConnectorToolNameSchema,
  type ConnectorToolPolicy,
  ConnectorToolPolicyContract,
  ConnectorToolPolicySchema,
} from "./contracts/connectors/connector-tool-policy.schema.ts";
export {
  CONNECTORS_ENDPOINTS,
  createConnectorEndpoint,
  deleteConnectorEndpoint,
  getConnectorEndpoint,
  listConnectorsEndpoint,
  setConnectorSecretEndpoint,
  updateConnectorEndpoint,
} from "./contracts/connectors/endpoints.ts";
export { type ContractDefinition, defineContract } from "./contracts/contract.ts";
export {
  ContractDefinitionError,
  type ContractDefinitionErrorCode,
} from "./contracts/contract-definition-error.ts";
export { CHAT_PERMISSIONS } from "./contracts/conversations/chat-permissions.ts";
export {
  type ChatRequest,
  ChatRequestContract,
  ChatRequestSchema,
  ChatTextPartSchema,
  MAX_APPROVAL_REASON_CHARS,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_TEXT_CHARS,
  type ToolApprovalResponsePart,
  ToolApprovalResponsePartSchema,
} from "./contracts/conversations/chat-request.schema.ts";
// SP4 chat: conversations, chat requests, generative UI props and voice.
export {
  type ChatAgentId,
  ChatAgentIdSchema,
  type Conversation,
  ConversationContract,
  type ConversationId,
  ConversationIdSchema,
  ConversationSchema,
  MAX_SEARCH_TOKENS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
} from "./contracts/conversations/conversation.schema.ts";
export {
  type ConversationPatch,
  ConversationPatchContract,
  ConversationPatchSchema,
} from "./contracts/conversations/conversation-patch.schema.ts";
export {
  ChatStreamSchema,
  ChatUiMessageSchema,
  CONVERSATIONS_ENDPOINTS,
  deleteConversationEndpoint,
  getConversationEndpoint,
  ListConversationsQuerySchema,
  listConversationMessagesEndpoint,
  listConversationsEndpoint,
  resumeChatStreamEndpoint,
  sendChatMessageEndpoint,
  stopChatRunEndpoint,
  summarizeConversationEndpoint,
  updateConversationEndpoint,
} from "./contracts/conversations/endpoints.ts";
export {
  type MessageFeedback,
  MessageFeedbackContract,
  type MessageFeedbackInput,
  MessageFeedbackInputContract,
  MessageFeedbackInputSchema,
  MessageFeedbackSchema,
  MessageRatingSchema,
} from "./contracts/conversations/message-feedback.schema.ts";
export {
  type MessageAttachment,
  MessageAttachmentSchema,
  type MessageMetadata,
  MessageMetadataContract,
  MessageMetadataSchema,
} from "./contracts/conversations/message-metadata.schema.ts";
export {
  type ToolApprovalDecision,
  ToolApprovalDecisionContract,
  ToolApprovalDecisionSchema,
} from "./contracts/conversations/tool-approval-decision.schema.ts";
// Removable sample contract (keeps the catalog non-empty).
export { type Note, NoteContract, type NoteId, NoteIdSchema, NoteSchema } from "./contracts/example/note.schema.ts";
export { type FieldDocs, none, personal, sensitive } from "./contracts/field-docs.ts";
export {
  isFieldOptional,
  listTopLevelFields,
  readFieldMeta,
  readRawFieldMeta,
  type ZodMetaRegistry,
} from "./contracts/field-meta.ts";
export {
  type FieldMetaInspection,
  type FieldMetaProblem,
  inspectSchema,
  isPiiBelow,
  maxPii,
} from "./contracts/field-meta-rules.ts";
export {
  FILES_ENDPOINTS,
  getFileEndpoint,
  getFileReadUrlEndpoint,
  requestFileUploadEndpoint,
} from "./contracts/files/endpoints.ts";
export {
  FileNameSchema,
  type FilePurpose,
  FilePurposeSchema,
  type FileUploadRequest,
  FileUploadRequestContract,
  FileUploadRequestSchema,
  MAX_UPLOAD_BYTES,
} from "./contracts/files/file-upload-request.schema.ts";
export {
  type FileReadUrl,
  FileReadUrlContract,
  FileReadUrlSchema,
  type FileUploadTicket,
  FileUploadTicketContract,
  FileUploadTicketSchema,
  type UploadInstructions,
  UploadInstructionsSchema,
} from "./contracts/files/file-upload-ticket.schema.ts";
export {
  type FileId,
  FileIdSchema,
  type StoredFile,
  StoredFileContract,
  StoredFileSchema,
} from "./contracts/files/stored-file.schema.ts";
export {
  defineEndpoint,
  type EndpointAuth,
  type EndpointDefinition,
  type EndpointErrors,
  type EndpointResponses,
  type ErrorStatus,
  type HttpMethod,
  type InferEndpointInput,
  type InferEndpointResponse,
  pathParamNames,
  type SuccessStatus,
} from "./contracts/http/endpoint.ts";
export {
  EndpointDefinitionError,
  type EndpointDefinitionErrorCode,
} from "./contracts/http/endpoint-definition-error.ts";
export { createEndpointRegistry, type EndpointRegistry } from "./contracts/http/endpoint-registry.ts";
export {
  dataEnvelope,
  type ErrorCode,
  ErrorCodeSchema,
  type ErrorDetail,
  ErrorDetailSchema,
  type ErrorEnvelope,
  ErrorEnvelopeContract,
  ErrorEnvelopeSchema,
  listEnvelope,
  type PageMeta,
  PageMetaSchema,
  type PageQuery,
  PageQuerySchema,
} from "./contracts/http/envelopes.schema.ts";
export { CORE_ERROR_CODES, type CoreErrorCode, CoreErrorCodeSchema } from "./contracts/http/error-codes.ts";
export {
  type SetActiveOrganizationInput,
  SetActiveOrganizationInputContract,
  SetActiveOrganizationInputSchema,
} from "./contracts/identity/active-organization-input.schema.ts";
export {
  API_KEY_MAX_LIFETIME_DAYS,
  API_KEY_MAX_SCOPES,
  type ApiKey,
  ApiKeyContract,
  type ApiKeyExpiryIssue,
  ApiKeyNameSchema,
  ApiKeyPublicIdSchema,
  type ApiKeyRevokedReason,
  ApiKeyRevokedReasonSchema,
  ApiKeySchema,
  type ApiKeyStatus,
  ApiKeyStatusSchema,
  apiKeyExpiryIssue,
  type CreateApiKeyInput,
  CreateApiKeyInputContract,
  CreateApiKeyInputSchema,
  type CreateApiKeyResponse,
  CreateApiKeyResponseContract,
  CreateApiKeyResponseSchema,
} from "./contracts/identity/api-key.schema.ts";
// SP1 identity.
export { IDENTITY_CONTRACTS } from "./contracts/identity/contracts.ts";
export {
  type CreateDesktopSessionResponse,
  CreateDesktopSessionResponseContract,
  CreateDesktopSessionResponseSchema,
  CustomTokenSchema,
  DesktopSessionSecretSchema,
  type ExchangeDesktopSessionInput,
  ExchangeDesktopSessionInputContract,
  ExchangeDesktopSessionInputSchema,
  type ExchangeDesktopSessionResponse,
  ExchangeDesktopSessionResponseContract,
  ExchangeDesktopSessionResponseSchema,
} from "./contracts/identity/desktop-session.schema.ts";
export {
  type Device,
  DeviceContract,
  DeviceLabelSchema,
  DeviceSchema,
  type DeviceStatus,
  DeviceStatusSchema,
} from "./contracts/identity/device.schema.ts";
export {
  type CreateDeviceActivationInput,
  CreateDeviceActivationInputContract,
  CreateDeviceActivationInputSchema,
  type CreateDeviceActivationResponse,
  CreateDeviceActivationResponseContract,
  CreateDeviceActivationResponseSchema,
  DEVICE_ACTIVATION_TTL_MINUTES,
  DeviceActivationCodeInputSchema,
  DeviceActivationCodeSchema,
  type RedeemDeviceActivationInput,
  RedeemDeviceActivationInputContract,
  RedeemDeviceActivationInputSchema,
  type RedeemDeviceActivationResponse,
  RedeemDeviceActivationResponseContract,
  RedeemDeviceActivationResponseSchema,
} from "./contracts/identity/device-activation.schema.ts";
export {
  createApiKeyEndpoint,
  createDesktopSessionEndpoint,
  createDeviceActivationEndpoint,
  endImpersonationEndpoint,
  exchangeDesktopSessionEndpoint,
  getAccessContextEndpoint,
  getMeEndpoint,
  IDENTITY_ENDPOINTS,
  listApiKeysEndpoint,
  listDevicesEndpoint,
  listMyGrantsEndpoint,
  listMyOrganizationsEndpoint,
  listSessionsEndpoint,
  redeemDeviceActivationEndpoint,
  revokeAllSessionsEndpoint,
  revokeApiKeyEndpoint,
  revokeDeviceEndpoint,
  revokeSessionEndpoint,
  setActiveOrganizationEndpoint,
  startImpersonationEndpoint,
  syncClaimsEndpoint,
  updateMeEndpoint,
} from "./contracts/identity/endpoints.ts";
export {
  type ApiKeyId,
  ApiKeyIdSchema,
  type DeviceActivationId,
  DeviceActivationIdSchema,
  type DeviceId,
  DeviceIdSchema,
  type ImpersonationSessionId,
  ImpersonationSessionIdSchema,
  type SessionId,
  SessionIdSchema,
} from "./contracts/identity/ids.schema.ts";
export {
  type ImpersonationSession,
  ImpersonationSessionContract,
  ImpersonationSessionSchema,
  MAX_IMPERSONATION_MINUTES,
  type StartImpersonationInput,
  StartImpersonationInputContract,
  StartImpersonationInputSchema,
  type StartImpersonationResponse,
  StartImpersonationResponseContract,
  StartImpersonationResponseSchema,
} from "./contracts/identity/impersonation-session.schema.ts";
export {
  type Me,
  type MeCapabilities,
  MeCapabilitiesSchema,
  MeContract,
  MeSchema,
} from "./contracts/identity/me.schema.ts";
export {
  PLATFORM_ROLES,
  type PlatformRole,
  PlatformRoleSchema,
  type PlatformStaff,
  PlatformStaffContract,
  PlatformStaffSchema,
} from "./contracts/identity/platform-staff.schema.ts";
export {
  type DevicePrincipal,
  type Principal,
  PrincipalContract,
  PrincipalSchema,
  type ServicePrincipal,
  type UserPrincipal,
} from "./contracts/identity/principal.schema.ts";
export {
  type SessionKind,
  SessionKindSchema,
  type SessionSummary,
  SessionSummaryContract,
  SessionSummarySchema,
} from "./contracts/identity/session.schema.ts";
export {
  type UpdateMeInput,
  UpdateMeInputContract,
  UpdateMeInputSchema,
} from "./contracts/identity/update-me-input.schema.ts";
export {
  DisplayNameSchema,
  type LastContext,
  LastContextSchema,
  type User,
  UserContract,
  UserSchema,
  type UserStatus,
  UserStatusSchema,
} from "./contracts/identity/user.schema.ts";
export {
  DEFAULT_USER_PREFERENCES,
  type NotificationPreferences,
  NotificationPreferencesSchema,
  type Theme,
  ThemeSchema,
  type UserPreferences,
  UserPreferencesContract,
  UserPreferencesSchema,
} from "./contracts/identity/user-preferences.schema.ts";
export {
  type Citation,
  CitationContract,
  type CitationId,
  CitationIdSchema,
  CitationSchema,
} from "./contracts/knowledge/citation.schema.ts";
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
  type KnowledgeDocument,
  KnowledgeDocumentContract,
  type KnowledgeDocumentId,
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentSchema,
  type KnowledgeDocumentSource,
  KnowledgeDocumentSourceSchema,
  type KnowledgeDocumentStatus,
  KnowledgeDocumentStatusSchema,
  type KnowledgeNamespace,
  KnowledgeNamespaceSchema,
  PLATFORM_TENANT_ID,
} from "./contracts/knowledge/knowledge-document.schema.ts";
export {
  type KnowledgeSource,
  KnowledgeSourceContract,
  KnowledgeSourceSchema,
} from "./contracts/knowledge/knowledge-source.schema.ts";
// SP2 module contract and module settings (decision 0015).
export { type CapabilityRef, CapabilityRefSchema } from "./contracts/modules/capability-ref.schema.ts";
export { defineModule } from "./contracts/modules/define-module.ts";
export {
  getModuleSettingsEndpoint,
  MODULES_ENDPOINTS,
  ModuleSettingsParamsSchema,
  updateModuleSettingsEndpoint,
} from "./contracts/modules/endpoints.ts";
export { ModuleDefinitionError, type ModuleDefinitionErrorCode } from "./contracts/modules/module-definition-error.ts";
export {
  CAPABILITY_KINDS,
  type CapabilityKind,
  type ModuleId,
  ModuleIdSchema,
  type ModuleManifest,
  ModuleManifestSchema,
  ModuleSettingsDefinitionSchema,
  type ModuleSettingsManifest,
  RESERVED_MODULE_IDS,
} from "./contracts/modules/module-manifest.schema.ts";
export {
  type ModuleSettings,
  ModuleSettingsContract,
  ModuleSettingsSchema,
  type ModuleSettingsValues,
  ModuleSettingsValuesSchema,
} from "./contracts/modules/module-settings.schema.ts";
export {
  NAV_SLOTS,
  type NavItem,
  NavItemSchema,
  type NavSlot,
  NavSlotSchema,
} from "./contracts/modules/nav-item.schema.ts";
export {
  addEvalDatasetItemEndpoint,
  adminGetExperimentEndpoint,
  adminGetTraceEndpoint,
  adminListDatasetsEndpoint,
  adminListExperimentsEndpoint,
  adminListTracesEndpoint,
  createEvalDatasetEndpoint,
  deleteEvalDatasetEndpoint,
  deleteEvalDatasetItemEndpoint,
  getEvalExperimentEndpoint,
  getTraceEndpoint,
  listEvalDatasetItemsEndpoint,
  listEvalDatasetsEndpoint,
  listEvalExperimentsEndpoint,
  listTracesEndpoint,
  OBSERVABILITY_ENDPOINTS,
  recordMessageFeedbackEndpoint,
  renameEvalDatasetEndpoint,
  startEvalExperimentEndpoint,
} from "./contracts/observability/endpoints.ts";
export {
  type EvalDataset,
  EvalDatasetContract,
  EvalDatasetSchema,
  type StartEvalExperimentInput,
  StartEvalExperimentInputContract,
  StartEvalExperimentInputSchema,
} from "./contracts/observability/eval-dataset.schema.ts";
export {
  type AddEvalDatasetItemInput,
  AddEvalDatasetItemInputContract,
  AddEvalDatasetItemInputSchema,
  type CreateEvalDatasetInput,
  CreateEvalDatasetInputContract,
  CreateEvalDatasetInputSchema,
  type EvalDatasetItem,
  EvalDatasetItemContract,
  EvalDatasetItemSchema,
} from "./contracts/observability/eval-dataset-item.schema.ts";
export {
  type EvalExperimentSummary,
  EvalExperimentSummaryContract,
  EvalExperimentSummarySchema,
} from "./contracts/observability/eval-experiment-summary.schema.ts";
export {
  type TraceDetail,
  TraceDetailContract,
  TraceDetailSchema,
  type TraceSpan,
  TraceSpanSchema,
} from "./contracts/observability/trace-detail.schema.ts";
export {
  SpanIdSchema,
  TraceIdSchema,
  TraceStatusSchema,
  type TraceSummary,
  TraceSummaryContract,
  TraceSummarySchema,
} from "./contracts/observability/trace-summary.schema.ts";
export {
  type AdminAgent,
  AdminAgentContract,
  AdminAgentEnablementSchema,
  type AdminAgentRole,
  AdminAgentRoleSchema,
  AdminAgentSchema,
} from "./contracts/platform/admin-agent.schema.ts";
export { ADMIN_AGENT_ENDPOINTS, adminListAgentsEndpoint } from "./contracts/platform/admin-agent-endpoints.ts";
export {
  ADMIN_PLATFORM_ENDPOINTS,
  createPlanEndpoint,
  deletePlanEndpoint,
  getAdminOverviewEndpoint,
  getAdminUsageEndpoint,
  getAgentSettingsEndpoint,
  getOrganizationAdminEndpoint,
  getOrganizationAgentSettingsEndpoint,
  listOrganizationsAdminEndpoint,
  listPlansEndpoint,
  setOrganizationBudgetEndpoint,
  updateAgentSettingsEndpoint,
  updateOrganizationAdminEndpoint,
  updateOrganizationAgentSettingsEndpoint,
  updatePlanEndpoint,
} from "./contracts/platform/admin-endpoints.ts";
export {
  type AdminImpersonationSession,
  AdminImpersonationSessionContract,
  AdminImpersonationSessionSchema,
  type AdminImpersonationStatus,
  AdminImpersonationStatusSchema,
} from "./contracts/platform/admin-impersonation.schema.ts";
export {
  ADMIN_IMPERSONATION_ENDPOINTS,
  adminEndImpersonationSessionEndpoint,
  adminListImpersonationSessionsEndpoint,
} from "./contracts/platform/admin-impersonation-endpoints.ts";
export {
  ADMIN_MODEL_ENDPOINTS,
  adminGetModelSettingsEndpoint,
  adminUpdateModelSettingsEndpoint,
} from "./contracts/platform/admin-model-endpoints.ts";
export {
  type AdminSchedule,
  AdminScheduleContract,
  AdminScheduleSchema,
  type AdminWorkflowRun,
  AdminWorkflowRunContract,
  AdminWorkflowRunSchema,
  LogLevelSchema,
  type LogLine,
  LogLineContract,
  type LogLineLevel,
  LogLineSchema,
} from "./contracts/platform/admin-operations.schema.ts";
// SP5 staff console operations (decision 0043): runs, schedules, connectors and local logs for `/admin`.
export {
  ADMIN_OPERATIONS_ENDPOINTS,
  adminCancelWorkflowRunEndpoint,
  adminListConnectorsEndpoint,
  adminListLogsEndpoint,
  adminListSchedulesEndpoint,
  adminListWorkflowRunsEndpoint,
  adminPauseScheduleEndpoint,
  adminResumeScheduleEndpoint,
  adminRunScheduleNowEndpoint,
} from "./contracts/platform/admin-operations-endpoints.ts";
export {
  type AdminOverview,
  AdminOverviewContract,
  AdminOverviewSchema,
} from "./contracts/platform/admin-overview.schema.ts";
export {
  ADMIN_USAGE_MAX_DAYS,
  type AdminUsage,
  AdminUsageContract,
  AdminUsageSchema,
  type AdminUsageTotals,
  AdminUsageTotalsSchema,
  UsageDaySchema,
} from "./contracts/platform/admin-usage.schema.ts";
export {
  ADMIN_USER_LOOKUP_MAX,
  type AdminUserSearchBy,
  AdminUserSearchBySchema,
  type AdminUserSummary,
  AdminUserSummaryContract,
  AdminUserSummarySchema,
} from "./contracts/platform/admin-user.schema.ts";
// SP5 admin gaps (decision 0044): staff user search and batched name lookup.
export { ADMIN_USER_ENDPOINTS, adminListUsersEndpoint } from "./contracts/platform/admin-user-endpoints.ts";
export {
  type FeatureFlag,
  FeatureFlagContract,
  type FeatureFlagDefinition,
  FeatureFlagDefinitionContract,
  FeatureFlagDefinitionSchema,
  FeatureFlagKeySchema,
  type FeatureFlagKind,
  FeatureFlagKindSchema,
  FeatureFlagSchema,
  type SetFeatureFlagValueInput,
  SetFeatureFlagValueInputContract,
  SetFeatureFlagValueInputSchema,
  type TenantFlagValueInput,
  TenantFlagValueInputContract,
  TenantFlagValueInputSchema,
} from "./contracts/platform/feature-flag.schema.ts";
export {
  adminClearFlagOverrideEndpoint,
  adminListFlagsEndpoint,
  adminSetFlagEndpoint,
  clearTenantFlagEndpoint,
  FLAG_ENDPOINTS,
  listFlagsEndpoint,
  setTenantFlagEndpoint,
} from "./contracts/platform/flag-endpoints.ts";
export {
  EDITABLE_MODEL_ROLES,
  type EditableModelRole,
  MODEL_SETTING_ROLES,
  type ModelCatalogEntry,
  ModelCatalogEntrySchema,
  ModelIdSchema,
  type ModelPriceInput,
  ModelPriceInputSchema,
  type ModelRoleSetting,
  ModelRoleSettingSchema,
  type ModelSettings,
  ModelSettingsContract,
  ModelSettingsSchema,
  type UpdateModelSettingsInput,
  UpdateModelSettingsInputContract,
  UpdateModelSettingsInputSchema,
} from "./contracts/platform/model-settings.schema.ts";
export {
  type BudgetCaps,
  BudgetCapsSchema,
  BudgetSourceSchema,
  type OrganizationAdminDetail,
  OrganizationAdminDetailContract,
  OrganizationAdminDetailSchema,
  type OrganizationAdminSummary,
  OrganizationAdminSummaryContract,
  OrganizationAdminSummarySchema,
  type SetTenantBudgetInput,
  SetTenantBudgetInputContract,
  SetTenantBudgetInputSchema,
  type UpdateOrganizationAdminInput,
  UpdateOrganizationAdminInputContract,
  UpdateOrganizationAdminInputSchema,
} from "./contracts/platform/organization-admin.schema.ts";
export {
  type Plan,
  PlanContract,
  type PlanId,
  PlanIdSchema,
  type PlanLimits,
  PlanLimitsSchema,
  PlanSchema,
  type UpsertPlanInput,
  UpsertPlanInputContract,
  UpsertPlanInputSchema,
} from "./contracts/platform/plan.schema.ts";
export {
  type CatalogMeta,
  CatalogMetaSchema,
  type ContractId,
  ContractIdSchema,
  type ContractKind,
  ContractKindSchema,
  CUSTOM_META_KEYS,
  type FieldMeta,
  FieldMetaSchema,
  type Permission,
  PermissionSchema,
  type PiiLevel,
  PiiLevelSchema,
  type Relation,
  RelationSchema,
  type TenancyScope,
  TenancyScopeSchema,
  type UiMeta,
  UiMetaSchema,
} from "./contracts/primitives/catalog-meta.schema.ts";
export {
  type EventId,
  EventIdSchema,
  firestoreIdSchema,
  type IdempotencyKey,
  IdempotencyKeySchema,
  type RequestId,
  RequestIdSchema,
  type TenantId,
  TenantIdSchema,
  type UserId,
  UserIdSchema,
} from "./contracts/primitives/ids.schema.ts";
export { type IsoDateTime, IsoDateTimeSchema } from "./contracts/primitives/iso-datetime.schema.ts";
export { type Locale, LocaleSchema } from "./contracts/primitives/locale.schema.ts";
export { type Currency, CurrencySchema, type Money, MoneySchema } from "./contracts/primitives/money.schema.ts";
export { HAS_ANY_FIELD_ERROR, hasAnyField, hasUniqueItems } from "./contracts/primitives/refinements.ts";
export { type TimeZone, TimeZoneSchema } from "./contracts/primitives/time-zone.schema.ts";
export { type ContractRegistry, createContractRegistry, type RegisteredContract } from "./contracts/registry.ts";
export { SP5_ADMIN_ENDPOINTS } from "./contracts/sp5-admin-endpoints.ts";
// SP5 workflows, prompts, platform console and observability.
export { SP5_CONTRACTS } from "./contracts/sp5-contracts.ts";
export {
  getUsageSummaryEndpoint,
  listAgentCatalogEndpoint,
  listWorkflowCatalogEndpoint,
  SP5_SETTINGS_CONTRACTS,
  SP5_SETTINGS_ENDPOINTS,
} from "./contracts/sp5-settings-endpoints.ts";
// SP1 tenancy.
export { TENANCY_CONTRACTS } from "./contracts/tenancy/contracts.ts";
export {
  type CreateOrganizationInput,
  CreateOrganizationInputContract,
  CreateOrganizationInputSchema,
} from "./contracts/tenancy/create-organization-input.schema.ts";
export {
  type CreateProjectInput,
  CreateProjectInputContract,
  CreateProjectInputSchema,
} from "./contracts/tenancy/create-project-input.schema.ts";
export {
  type CreateUnitInput,
  CreateUnitInputContract,
  CreateUnitInputSchema,
} from "./contracts/tenancy/create-unit-input.schema.ts";
export {
  createOrganizationEndpoint,
  createProjectEndpoint,
  createUnitEndpoint,
  deleteOrganizationEndpoint,
  deleteProjectEndpoint,
  deleteUnitEndpoint,
  getOrganizationEndpoint,
  getProjectEndpoint,
  getUnitEndpoint,
  listProjectsEndpoint,
  listUnitsEndpoint,
  listUnitTypesEndpoint,
  OrganizationParamsSchema,
  TENANCY_ENDPOINTS,
  updateOrganizationEndpoint,
  updateProjectEndpoint,
  updateUnitEndpoint,
} from "./contracts/tenancy/endpoints.ts";
export {
  type OrganizationId,
  OrganizationIdSchema,
  type ProjectId,
  ProjectIdSchema,
  type UnitId,
  UnitIdSchema,
} from "./contracts/tenancy/ids.schema.ts";
export {
  type NodeRef,
  NodeRefContract,
  NodeRefSchema,
  type TenantNodeRef,
  TenantNodeRefContract,
  TenantNodeRefSchema,
  tenantNodeRefField,
} from "./contracts/tenancy/node-ref.schema.ts";
export {
  NodeNameSchema,
  ORGANIZATION_EXAMPLE,
  type Organization,
  OrganizationContract,
  OrganizationSchema,
  type OrganizationStatus,
  OrganizationStatusSchema,
} from "./contracts/tenancy/organization.schema.ts";
export {
  PROJECT_EXAMPLE,
  type Project,
  ProjectContract,
  ProjectDescriptionSchema,
  ProjectSchema,
  type ProjectStatus,
  ProjectStatusSchema,
} from "./contracts/tenancy/project.schema.ts";
export {
  type NodeRegionalOverrides,
  NodeRegionalOverridesSchema,
  type RegionalDefaults,
  RegionalDefaultsSchema,
} from "./contracts/tenancy/regional-defaults.schema.ts";
export {
  type RegionalSettings,
  RegionalSettingsContract,
  RegionalSettingsSchema,
} from "./contracts/tenancy/regional-settings.schema.ts";
export {
  MAX_UNIT_DEPTH,
  UNIT_EXAMPLE,
  type Unit,
  UnitContract,
  UnitFieldsSchema,
  UnitSchema,
} from "./contracts/tenancy/unit.schema.ts";
export {
  type UnitParentKind,
  UnitParentKindSchema,
  type UnitTypeDefinition,
  UnitTypeDefinitionContract,
  UnitTypeDefinitionSchema,
  type UnitTypeId,
  UnitTypeIdSchema,
} from "./contracts/tenancy/unit-type.schema.ts";
export {
  type UpdateOrganizationInput,
  UpdateOrganizationInputContract,
  UpdateOrganizationInputSchema,
} from "./contracts/tenancy/update-organization-input.schema.ts";
export {
  NodeRegionalOverridesPatchSchema,
  type UpdateProjectInput,
  UpdateProjectInputContract,
  UpdateProjectInputSchema,
} from "./contracts/tenancy/update-project-input.schema.ts";
export {
  type UpdateUnitInput,
  UpdateUnitInputContract,
  UpdateUnitInputSchema,
} from "./contracts/tenancy/update-unit-input.schema.ts";
export { type LlmCall, LlmCallContract, LlmCallSchema } from "./contracts/usage/llm-call.schema.ts";
export {
  type UsageDailyRollup,
  UsageDailyRollupContract,
  UsageDailyRollupSchema,
} from "./contracts/usage/usage-daily-rollup.schema.ts";
export { type UsageSummary, UsageSummaryContract, UsageSummarySchema } from "./contracts/usage/usage-summary.schema.ts";
export {
  createRealtimeSessionEndpoint,
  getVoiceAvailabilityEndpoint,
  SpeechAudioSchema,
  synthesizeSpeechEndpoint,
  transcribeVoiceEndpoint,
  VOICE_ENDPOINTS,
} from "./contracts/voice/endpoints.ts";
export {
  MAX_SPEECH_TEXT_CHARS,
  type RealtimeSession,
  RealtimeSessionContract,
  RealtimeSessionSchema,
  type SpeechRequest,
  SpeechRequestContract,
  SpeechRequestSchema,
  type Transcription,
  TranscriptionContract,
  TranscriptionSchema,
  type VoiceAvailability,
  VoiceAvailabilityContract,
  VoiceAvailabilitySchema,
} from "./contracts/voice/voice.schema.ts";
export {
  cancelWorkflowRunEndpoint,
  createScheduleEndpoint,
  deleteScheduleEndpoint,
  getScheduleEndpoint,
  getWorkflowRunEndpoint,
  listSchedulesEndpoint,
  listWorkflowRunsEndpoint,
  OrganizationQuerySchema,
  pauseScheduleEndpoint,
  previewScheduleEndpoint,
  resumeScheduleEndpoint,
  runScheduleNowEndpoint,
  SCHEDULE_ENDPOINTS,
  ScheduleRunQueuedSchema,
  StartedWorkflowRunSchema,
  startWorkflowRunEndpoint,
  streamWorkflowRunEndpoint,
  updateScheduleEndpoint,
  WORKFLOW_RUN_ENDPOINTS,
  WorkflowRunStreamSchema,
} from "./contracts/workflows/endpoints.ts";
export {
  HUMAN_APPROVAL_DECISIONS,
  type HumanApprovalDecision,
  HumanApprovalDecisionSchema,
  type HumanApprovalResume,
  HumanApprovalResumeContract,
  HumanApprovalResumeSchema,
  type HumanApprovalSuspend,
  HumanApprovalSuspendSchema,
  WORKFLOW_RESUME_ACTION_KIND,
  WorkflowIdSchema,
  type WorkflowResumeActionInput,
  WorkflowResumeActionInputContract,
  WorkflowResumeActionInputSchema,
} from "./contracts/workflows/human-approval-resume.schema.ts";
export {
  type CreateScheduleInput,
  CreateScheduleInputContract,
  CreateScheduleInputSchema,
  CronExpressionSchema,
  SCHEDULE_PREVIEW_FIRES,
  type Schedule,
  ScheduleContract,
  type SchedulePreview,
  SchedulePreviewContract,
  type SchedulePreviewInput,
  SchedulePreviewInputContract,
  SchedulePreviewInputSchema,
  SchedulePreviewSchema,
  ScheduleSchema,
  ScheduleSlugSchema,
  type ScheduleStatus,
  ScheduleStatusSchema,
  type UpdateScheduleInput,
  UpdateScheduleInputContract,
  UpdateScheduleInputSchema,
} from "./contracts/workflows/schedule.schema.ts";
export {
  type WorkflowCatalogEntry,
  WorkflowCatalogEntryContract,
  WorkflowCatalogEntrySchema,
} from "./contracts/workflows/workflow-catalog.schema.ts";
export {
  WORKFLOW_EVENT_TYPES,
  type WorkflowEvent,
  WorkflowEventContract,
  WorkflowEventSchema,
  WorkflowEventTypeSchema,
} from "./contracts/workflows/workflow-event.schema.ts";
export {
  type StartWorkflowRunInput,
  StartWorkflowRunInputContract,
  StartWorkflowRunInputSchema,
  WORKFLOW_RUN_FAILURE_CODES,
  WORKFLOW_RUN_STATUSES,
  type WorkflowRun,
  WorkflowRunContract,
  type WorkflowRunFailure,
  type WorkflowRunFailureCode,
  WorkflowRunFailureCodeSchema,
  WorkflowRunFailureSchema,
  WorkflowRunSchema,
  type WorkflowRunStatus,
  WorkflowRunStatusSchema,
} from "./contracts/workflows/workflow-run.schema.ts";
