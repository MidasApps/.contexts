import type { ApprovalPort, ConnectorsPort, SecretStore, SettingsPort, WebContentPort } from "@core/agents";

export type UnwiredPortName = "approvals" | "connectors" | "secrets" | "settings" | "webContent";

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
 * Task 17; tools answer `APPROVAL_UNAVAILABLE`),
 * connectors and secrets (Task 21), agent settings, web content (Firecrawl, Task 23:
 * URL ingestion fails after its retries until then).
 */
export const UNWIRED_PORTS: {
  readonly approvals: ApprovalPort;
  readonly connectors: ConnectorsPort;
  readonly secrets: SecretStore;
  readonly settings: SettingsPort;
  readonly webContent: WebContentPort;
} = {
  approvals: { requestApproval: reject("approvals") },
  connectors: { listActive: reject("connectors") },
  secrets: { get: reject("secrets") },
  settings: { getAgentSettings: reject("settings") },
  webContent: { scrape: reject("webContent") },
};
