import type { Connector, ConnectorId } from "@core/contracts";
import type { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { ConnectorNotFoundError } from "../../domain/connector-errors.ts";
import {
  authorizeConnectors,
  CONNECTOR_READ_PERMISSION,
  type ConnectorsCommand,
  type ConnectorsDeps,
} from "../connectors-deps.ts";

export type ListConnectors = (
  command: Omit<ConnectorsCommand, "requestId"> & { readonly page: PageRequest },
) => Promise<Result<Page<Connector>, AccessDeniedError>>;

export type GetConnector = (
  command: Omit<ConnectorsCommand, "requestId"> & { readonly connectorId: ConnectorId },
) => Promise<Result<Connector, AccessDeniedError | ConnectorNotFoundError>>;

/** Lists the organization's connectors, newest first (`core.connector.read`); no secret is ever part of a connector. */
export const makeListConnectors =
  (deps: Pick<ConnectorsDeps, "connectors">): ListConnectors =>
  async (command) => {
    const allowed = await authorizeConnectors(command, CONNECTOR_READ_PERMISSION);
    if (!allowed.ok) return allowed;
    return ok(await deps.connectors.list({ tenantId: command.tenantId, page: command.page }));
  };

/** Reads one connector of the organization (`core.connector.read`); another tenant's answers not found. */
export const makeGetConnector =
  (deps: Pick<ConnectorsDeps, "connectors">): GetConnector =>
  async (command) => {
    const allowed = await authorizeConnectors(command, CONNECTOR_READ_PERMISSION);
    if (!allowed.ok) return allowed;
    const connector = await deps.connectors.get(undefined, {
      tenantId: command.tenantId,
      connectorId: command.connectorId,
    });
    return connector === null ? err(new ConnectorNotFoundError()) : ok(connector);
  };
