import { type Connector, ConnectorSchema, type CreateConnectorInput } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { InvalidConnectorError } from "../../domain/connector-errors.ts";
import { connectorHostIssues } from "../../domain/connector-policy.ts";
import { authorizeConnectors, CONNECTOR_WRITE_PERMISSION, type ConnectorsCommand, type ConnectorsDeps, recordConnectorAudit } from "../connectors-deps.ts";

export type CreateConnector = (command: ConnectorsCommand & { readonly input: CreateConnectorInput }) => Promise<Result<Connector, AccessDeniedError | InvalidConnectorError>>;

/**
 * Registers a connector (`core.connector.write`): active, no secret yet (`PUT .../secret`
 * sets it), every endpoint host inside `allowedHosts`; audited as `CONNECTOR_CREATED`.
 */
export const makeCreateConnector =
  (deps: ConnectorsDeps): CreateConnector =>
  async (command) => {
    const allowed = await authorizeConnectors(command, CONNECTOR_WRITE_PERMISSION);
    if (!allowed.ok) return allowed;
    const issues = connectorHostIssues(command.input);
    if (issues.length > 0) return err(new InvalidConnectorError(issues));
    const now = deps.clock.now().toISOString();
    const connector = ConnectorSchema.parse({
      ...command.input,
      id: deps.connectors.newId(),
      tenantId: command.tenantId,
      status: "active",
      secretRef: null,
      createdBy: auditActorOf(command.actor).id,
      createdAt: now,
      updatedAt: now,
    });
    await deps.unitOfWork.run(async (tx) => {
      deps.connectors.create(tx, { connector });
      await recordConnectorAudit(deps, command, { action: "CONNECTOR_CREATED", connectorId: connector.id }, tx);
    });
    return ok(connector);
  };
