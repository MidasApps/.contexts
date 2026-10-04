import { type Connector, type ConnectorLoadErrorCode, connectorNeedsSecret } from "@core/contracts";
import type { ConnectorsPort } from "../runtime/runtime-ports.ts";
import { McpConnectorError } from "./mcp/mcp-connector.ts";
import { OpenApiConnectorError } from "./openapi/openapi-document.ts";

/** The stable code of a load failure; the raw error (hosts, SDK messages) never leaves the runtime. */
export const connectorLoadErrorCodeOf = (error: unknown): ConnectorLoadErrorCode => {
  if (error instanceof OpenApiConnectorError) return error.code;
  if (error instanceof McpConnectorError && error.code === "CONNECT_FAILED") return "CONNECT_FAILED";
  return "LOAD_FAILED";
};

/** How one connector's load ended: its tools loaded, or the code of why not. */
export type ConnectorLoadOutcome = {
  readonly connector: Connector;
  readonly secret: string | null;
  readonly error: unknown;
  readonly failed: boolean;
};

/** The code to record for an outcome, or `null` when the connector loaded with what it needs. */
const codeOf = (outcome: ConnectorLoadOutcome): ConnectorLoadErrorCode | null => {
  if (outcome.failed) return connectorLoadErrorCodeOf(outcome.error);
  return connectorNeedsSecret(outcome.connector) && outcome.secret === null ? "SECRET_MISSING" : null;
};

/**
 * Writes each connector's load result where the settings page shows it (`Connector.lastError`,
 * UX review U-59): a new code, or `null` when a connector that had failed loads again. Nothing is
 * written when nothing changed, so a healthy tenant costs no write per cache refresh. Fire and
 * forget: a failed write must not fail the agent's run.
 */
export const recordConnectorLoads = (args: {
  readonly connectors: ConnectorsPort;
  readonly tenantId: string;
  readonly outcomes: readonly ConnectorLoadOutcome[];
  readonly at: string;
}): void => {
  const { recordLoad } = args.connectors;
  if (recordLoad === undefined) return;
  for (const outcome of args.outcomes) {
    const code = codeOf(outcome);
    const previous = outcome.connector.lastError?.code ?? null;
    if (code === previous) continue;
    const lastError = code === null ? null : { code, at: args.at };
    void recordLoad({ tenantId: args.tenantId, connectorId: outcome.connector.id, lastError }).catch(() => undefined);
  }
};
