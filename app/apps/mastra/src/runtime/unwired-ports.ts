import type { ApprovalPort, ConnectorsPort, KnowledgePort, SecretStore, SettingsPort, UsagePort } from "@core/agents";

export type UnwiredPortName = "approvals" | "usage" | "knowledge" | "connectors" | "secrets" | "settings";

/** Bug guard: a port whose service lands in a later task was called; the call rejects, never succeeds. */
export class PortNotWiredError extends Error {
  readonly code = "PORT_NOT_WIRED";
  readonly port: UnwiredPortName;

  constructor(port: UnwiredPortName) {
    super(`PORT_NOT_WIRED: the ${port} port is not bound yet (see create-runtime-ports.ts)`);
    this.name = "PortNotWiredError";
    this.port = port;
  }
}

const reject = (port: UnwiredPortName) => (): Promise<never> => Promise.reject(new PortNotWiredError(port));

/**
 * Fail-closed stand-ins for ports whose services arrive later: approvals (SP1
 * Task 17; tools answer `APPROVAL_UNAVAILABLE`), usage and budgets (Task 16),
 * knowledge (Tasks 12/15), connectors and secrets (Task 21), agent settings.
 */
export const UNWIRED_PORTS: {
  readonly approvals: ApprovalPort;
  readonly usage: UsagePort;
  readonly knowledge: KnowledgePort;
  readonly connectors: ConnectorsPort;
  readonly secrets: SecretStore;
  readonly settings: SettingsPort;
} = {
  approvals: { requestApproval: reject("approvals") },
  usage: { recordLlmCalls: reject("usage"), checkTenantBudget: reject("usage") },
  knowledge: { searchChunks: reject("knowledge") },
  connectors: { listActive: reject("connectors") },
  secrets: { get: reject("secrets") },
  settings: { getAgentSettings: reject("settings") },
};
