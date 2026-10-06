import type { AuditAction, ConnectorId, Principal, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { requirePermission } from "../../access/application/grant-checks.ts";
import type { RequestAccess } from "../../access/composition.ts";
import type { AccessDeniedError } from "../../access/domain/errors/access-denied-error.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import { auditActorOf } from "../../audit/domain/audit-actor.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { Result } from "../../shared/result/result.ts";
import type { ConnectorRepository, SecretStore } from "./ports/connector-ports.ts";

export const CONNECTOR_READ_PERMISSION = "core.connector.read";
export const CONNECTOR_WRITE_PERMISSION = "core.connector.write";

/** Dependencies of the connectors use cases (`createConnectorsServices`). */
export type ConnectorsDeps = {
  readonly connectors: ConnectorRepository;
  readonly secrets: SecretStore;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
};

/** Who asks, with this request's access scope, in which organization. */
export type ConnectorsCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly requestId: string;
};

/** Authorizes a connector permission at the organization (fail-closed). */
export const authorizeConnectors = (
  command: Pick<ConnectorsCommand, "actor" | "access" | "tenantId">,
  permission: typeof CONNECTOR_READ_PERMISSION | typeof CONNECTOR_WRITE_PERMISSION,
): Promise<Result<void, AccessDeniedError>> =>
  requirePermission({
    access: command.access,
    actor: command.actor,
    permission,
    node: { level: "organization", tenantId: command.tenantId },
  });

/** One audit entry per connector change; field names only in `changes`, never values or secrets. */
export const recordConnectorAudit = async (
  deps: Pick<ConnectorsDeps, "audit">,
  command: ConnectorsCommand,
  fact: { readonly action: AuditAction; readonly connectorId: ConnectorId; readonly changes?: readonly string[] },
  tx?: Transaction,
): Promise<void> => {
  await deps.audit.record(
    {
      log: "tenant",
      tenantId: command.tenantId,
      action: fact.action,
      actor: auditActorOf(command.actor),
      target: { type: "connector", id: fact.connectorId },
      node: { level: "organization", tenantId: command.tenantId },
      outcome: "success",
      requestId: command.requestId,
      ...(fact.changes === undefined ? {} : { changes: [...fact.changes] }),
    },
    tx,
  );
};
