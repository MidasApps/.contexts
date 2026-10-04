import { type Connector, type ConnectorId, ConnectorSchema, type UpdateConnectorInput } from "@core/contracts";
import type { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { ConnectorNotFoundError, InvalidConnectorError } from "../../domain/connector-errors.ts";
import { connectorHostIssues } from "../../domain/connector-policy.ts";
import {
  authorizeConnectors,
  CONNECTOR_WRITE_PERMISSION,
  type ConnectorsCommand,
  type ConnectorsDeps,
  recordConnectorAudit,
} from "../connectors-deps.ts";

export type UpdateConnectorError = AccessDeniedError | ConnectorNotFoundError | InvalidConnectorError;

export type UpdateConnector = (
  command: ConnectorsCommand & { readonly connectorId: ConnectorId; readonly input: UpdateConnectorInput },
) => Promise<Result<Connector, UpdateConnectorError>>;

// The patched connector must still be a valid connector of the same type; issues name fields only.
const applyPatch = (
  current: Connector,
  input: UpdateConnectorInput,
  updatedAt: string,
): Result<Connector, InvalidConnectorError> => {
  const parsed = ConnectorSchema.safeParse({ ...current, ...input, config: input.config ?? current.config, updatedAt });
  if (!parsed.success) {
    return err(
      new InvalidConnectorError(
        parsed.error.issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "(body)",
          issue: issue.code.toUpperCase(),
        })),
      ),
    );
  }
  const issues = connectorHostIssues(parsed.data);
  return issues.length > 0 ? err(new InvalidConnectorError(issues)) : ok(parsed.data);
};

const changedFieldsOf = (input: UpdateConnectorInput): string[] =>
  Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .toSorted();

/** Changes a connector (`core.connector.write`); audited as `CONNECTOR_UPDATED` with the changed field names. */
export const makeUpdateConnector =
  (deps: ConnectorsDeps): UpdateConnector =>
  async (command) => {
    const allowed = await authorizeConnectors(command, CONNECTOR_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const now = deps.clock.now().toISOString();
    return deps.unitOfWork.run(async (tx): Promise<Result<Connector, UpdateConnectorError>> => {
      const current = await deps.connectors.get(tx, { tenantId: command.tenantId, connectorId: command.connectorId });
      if (current === null) return err(new ConnectorNotFoundError());
      const next = applyPatch(current, command.input, now);
      if (!next.ok) return next;
      deps.connectors.replace(tx, { connector: next.data, actorId: auditActorOf(command.actor).id });
      await recordConnectorAudit(
        deps,
        command,
        { action: "CONNECTOR_UPDATED", connectorId: current.id, changes: changedFieldsOf(command.input) },
        tx,
      );
      return ok(next.data);
    });
  };
