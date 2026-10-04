import type { ConnectorId } from "@core/contracts";
import type { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { ConnectorNotFoundError } from "../../domain/connector-errors.ts";
import { connectorSecretName } from "../../domain/connector-policy.ts";
import {
  authorizeConnectors,
  CONNECTOR_WRITE_PERMISSION,
  type ConnectorsCommand,
  type ConnectorsDeps,
  recordConnectorAudit,
} from "../connectors-deps.ts";

export type DeleteConnector = (
  command: ConnectorsCommand & { readonly connectorId: ConnectorId },
) => Promise<Result<void, AccessDeniedError | ConnectorNotFoundError>>;

/**
 * Deletes a connector and then its secret (`core.connector.write`), audited as
 * `CONNECTOR_DELETED`. The document goes first: a failed secret delete leaves an orphan
 * secret no connector points to, never a connector whose secret vanished.
 */
export const makeDeleteConnector =
  (deps: ConnectorsDeps): DeleteConnector =>
  async (command) => {
    const allowed = await authorizeConnectors(command, CONNECTOR_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const deleted = await deps.unitOfWork.run(async (tx) => {
      const current = await deps.connectors.get(tx, { tenantId: command.tenantId, connectorId: command.connectorId });
      if (current === null) return null;
      deps.connectors.delete(tx, { connectorId: current.id });
      await recordConnectorAudit(deps, command, { action: "CONNECTOR_DELETED", connectorId: current.id }, tx);
      return current;
    });
    if (deleted === null) return err(new ConnectorNotFoundError());
    if (deleted.secretRef !== null) await deps.secrets.delete(connectorSecretName(deleted));
    return ok(undefined);
  };
