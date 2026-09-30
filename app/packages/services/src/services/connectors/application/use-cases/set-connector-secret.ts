import type { ConnectorId, SetConnectorSecretInput } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { ConnectorNotFoundError } from "../../domain/connector-errors.ts";
import { connectorSecretName } from "../../domain/connector-policy.ts";
import { authorizeConnectors, CONNECTOR_WRITE_PERMISSION, type ConnectorsCommand, type ConnectorsDeps, recordConnectorAudit } from "../connectors-deps.ts";

export type SetConnectorSecret = (
  command: ConnectorsCommand & { readonly connectorId: ConnectorId; readonly input: SetConnectorSecretInput },
) => Promise<Result<void, AccessDeniedError | ConnectorNotFoundError>>;

/**
 * Stores the connector's secret in the secret store (`core.connector.write`) and points
 * `secretRef` at it; write-only (no read path over `/v1`). The value never reaches
 * Firestore, logs or the audit entry (`CONNECTOR_SECRET_SET` names the connector only).
 */
export const makeSetConnectorSecret =
  (deps: ConnectorsDeps): SetConnectorSecret =>
  async (command) => {
    const allowed = await authorizeConnectors(command, CONNECTOR_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const key = { tenantId: command.tenantId, connectorId: command.connectorId };
    const current = await deps.connectors.get(undefined, key);
    if (current === null) return err(new ConnectorNotFoundError());
    const secretRef = connectorSecretName(current);
    await deps.secrets.put(secretRef, command.input.value);
    const now = deps.clock.now().toISOString();
    await deps.unitOfWork.run(async (tx) => {
      const fresh = await deps.connectors.get(tx, key);
      // Deleted meanwhile: drop the secret we just wrote instead of reviving the connector.
      if (fresh === null) return;
      deps.connectors.replace(tx, { connector: { ...fresh, secretRef, updatedAt: now }, actorId: auditActorOf(command.actor).id });
      await recordConnectorAudit(deps, command, { action: "CONNECTOR_SECRET_SET", connectorId: fresh.id }, tx);
    });
    const still = await deps.connectors.get(undefined, key);
    if (still === null) {
      await deps.secrets.delete(secretRef);
      return err(new ConnectorNotFoundError());
    }
    return ok(undefined);
  };
