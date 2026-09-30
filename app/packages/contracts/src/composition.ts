// Composition root of @core/contracts: the only place that registers contracts
// and endpoints (rule `development`: module side effects live in composition.ts,
// and only run when a caller invokes the function).
import { ACCESS_CONTRACTS } from "./contracts/access/contracts.ts";
import { ACCESS_ENDPOINTS } from "./contracts/access/endpoints.ts";
import { AGENTS_ENDPOINTS } from "./contracts/agents/endpoints.ts";
import { AgentRequestContextContract } from "./contracts/agents/agent-request-context.schema.ts";
import { AgentSettingsContract } from "./contracts/agents/agent-settings.schema.ts";
import { AgentApprovalRequestContract } from "./contracts/agents/approval-request.schema.ts";
import { ToolUiContract } from "./contracts/agents/tool-ui.schema.ts";
import { AUDIT_CONTRACTS } from "./contracts/audit/contracts.ts";
import { AUDIT_ENDPOINTS } from "./contracts/audit/endpoints.ts";
import { ConnectorContract } from "./contracts/connectors/connector.schema.ts";
import { ConnectorToolPolicyContract } from "./contracts/connectors/connector-tool-policy.schema.ts";
import {
  CreateConnectorInputContract,
  SetConnectorSecretInputContract,
  UpdateConnectorInputContract,
} from "./contracts/connectors/connector-input.schema.ts";
import { CONNECTORS_ENDPOINTS } from "./contracts/connectors/endpoints.ts";
import type { ContractDefinition } from "./contracts/contract.ts";
import { NoteContract } from "./contracts/example/note.schema.ts";
import { FILES_ENDPOINTS } from "./contracts/files/endpoints.ts";
import { FileUploadRequestContract } from "./contracts/files/file-upload-request.schema.ts";
import { FileReadUrlContract, FileUploadTicketContract } from "./contracts/files/file-upload-ticket.schema.ts";
import { StoredFileContract } from "./contracts/files/stored-file.schema.ts";
import { CitationContract } from "./contracts/knowledge/citation.schema.ts";
import { KnowledgeDocumentContract } from "./contracts/knowledge/knowledge-document.schema.ts";
import { KNOWLEDGE_ENDPOINTS } from "./contracts/knowledge/endpoints.ts";
import { KnowledgeSourceContract } from "./contracts/knowledge/knowledge-source.schema.ts";
import { LlmCallContract } from "./contracts/usage/llm-call.schema.ts";
import { UsageSummaryContract } from "./contracts/usage/usage-summary.schema.ts";
import type { EndpointDefinition } from "./contracts/http/endpoint.ts";
import { createEndpointRegistry, type EndpointRegistry } from "./contracts/http/endpoint-registry.ts";
import { ErrorEnvelopeContract } from "./contracts/http/envelopes.schema.ts";
import { IDENTITY_CONTRACTS } from "./contracts/identity/contracts.ts";
import { IDENTITY_ENDPOINTS } from "./contracts/identity/endpoints.ts";
import { createContractRegistry, type ContractRegistry } from "./contracts/registry.ts";
import { TENANCY_CONTRACTS } from "./contracts/tenancy/contracts.ts";
import { TENANCY_ENDPOINTS } from "./contracts/tenancy/endpoints.ts";
import { SP5_CONTRACTS } from "./contracts/sp5-contracts.ts";

/** Every contract of the core; add new contracts here. `example.Note` is removable. */
export const CORE_CONTRACTS: readonly ContractDefinition[] = [
  NoteContract,
  ErrorEnvelopeContract,
  // SP1 identity, tenancy and access.
  ...TENANCY_CONTRACTS,
  ...IDENTITY_CONTRACTS,
  ...ACCESS_CONTRACTS,
  ...AUDIT_CONTRACTS,
  // SP3 agent runtime.
  AgentRequestContextContract,
  AgentSettingsContract,
  ToolUiContract,
  AgentApprovalRequestContract,
  KnowledgeDocumentContract,
  KnowledgeSourceContract,
  CitationContract,
  ConnectorContract,
  ConnectorToolPolicyContract,
  CreateConnectorInputContract,
  UpdateConnectorInputContract,
  SetConnectorSecretInputContract,
  LlmCallContract,
  UsageSummaryContract,
  FileUploadRequestContract,
  StoredFileContract,
  FileUploadTicketContract,
  FileReadUrlContract,
  // SP5 workflows, prompts, platform console and observability.
  ...SP5_CONTRACTS,
];

/** Every `/v1` endpoint of the core (SP1 spec §7.3); add descriptors here. */
export const CORE_ENDPOINTS: readonly EndpointDefinition[] = [
  ...TENANCY_ENDPOINTS,
  ...IDENTITY_ENDPOINTS,
  ...ACCESS_ENDPOINTS,
  ...AUDIT_ENDPOINTS,
  // SP3 core MCP server (Task 24).
  ...AGENTS_ENDPOINTS,
  // SP3 files (uploads), knowledge base and connectors.
  ...FILES_ENDPOINTS,
  ...KNOWLEDGE_ENDPOINTS,
  ...CONNECTORS_ENDPOINTS,
];

/** Builds a fresh registry with the core contracts (catalog scripts, apps at startup). */
export const composeCoreContracts = (extra: readonly ContractDefinition[] = []): ContractRegistry =>
  createContractRegistry([...CORE_CONTRACTS, ...extra]);

/** Builds the endpoint registry with the core endpoints plus module endpoints. */
export const composeCoreEndpoints = (extra: readonly EndpointDefinition[] = []): EndpointRegistry =>
  createEndpointRegistry([...CORE_ENDPOINTS, ...extra]);
