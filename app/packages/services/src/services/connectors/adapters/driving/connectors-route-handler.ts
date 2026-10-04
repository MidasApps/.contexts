import {
  createConnectorEndpoint,
  deleteConnectorEndpoint,
  getConnectorEndpoint,
  listConnectorsEndpoint,
  setConnectorSecretEndpoint,
  updateConnectorEndpoint,
} from "@core/contracts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse, invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { ConnectorsServices } from "../../composition.ts";
import { ConnectorNotFoundError, InvalidConnectorError } from "../../domain/connector-errors.ts";

/** @throws the error when it is not an expected connectors error (the boundary answers 500). */
const connectorErrorResponse = (error: Error, requestId: string): Response => {
  if (error instanceof AccessDeniedError) return deniedResponse(error.reason, requestId);
  if (error instanceof ConnectorNotFoundError) return apiError(404, "NOT_FOUND", requestId);
  if (error instanceof InvalidConnectorError) return apiError(400, "VALIDATION_FAILED", requestId, [...error.details]);
  throw error;
};

const connectorPath = (tenantId: string, connectorId: string) =>
  `/v1/organizations/${tenantId}/connectors/${connectorId}`;

/**
 * `/v1` handlers of tenant connectors (SP3 Task 21, decision 0027): list and create under
 * an organization, get / patch / delete one, and `PUT .../secret` (write-only, 204).
 * Reads need `core.connector.read`, changes `core.connector.write`; no response ever
 * carries a secret (connectors hold only `secretRef`).
 */
export const buildConnectorsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  connectors: ConnectorsServices;
}): Record<string, RouteHandler> => {
  const { pipeline, connectors } = deps;
  return {
    [listConnectorsEndpoint.id]: withApiRoute(
      listConnectorsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        const result = await connectors.listConnectors({
          actor: principal,
          access: scope,
          tenantId: input.params.organizationId,
          page,
        });
        return result.ok ? listResponse(result.data, page.limit) : connectorErrorResponse(result.error, requestId);
      },
    ),
    [createConnectorEndpoint.id]: withApiRoute(
      createConnectorEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const tenantId = input.params.organizationId;
        const result = await connectors.createConnector({
          actor: principal,
          access: scope,
          tenantId,
          requestId,
          input: input.body,
        });
        if (!result.ok) return connectorErrorResponse(result.error, requestId);
        return dataResponse({ data: result.data }, { status: 201, location: connectorPath(tenantId, result.data.id) });
      },
    ),
    [getConnectorEndpoint.id]: withApiRoute(
      getConnectorEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const { organizationId: tenantId, connectorId } = input.params;
        const result = await connectors.getConnector({ actor: principal, access: scope, tenantId, connectorId });
        return result.ok ? dataResponse({ data: result.data }) : connectorErrorResponse(result.error, requestId);
      },
    ),
    [updateConnectorEndpoint.id]: withApiRoute(
      updateConnectorEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const { organizationId: tenantId, connectorId } = input.params;
        const result = await connectors.updateConnector({
          actor: principal,
          access: scope,
          tenantId,
          connectorId,
          requestId,
          input: input.body,
        });
        return result.ok ? dataResponse({ data: result.data }) : connectorErrorResponse(result.error, requestId);
      },
    ),
    [deleteConnectorEndpoint.id]: withApiRoute(
      deleteConnectorEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const { organizationId: tenantId, connectorId } = input.params;
        const result = await connectors.deleteConnector({
          actor: principal,
          access: scope,
          tenantId,
          connectorId,
          requestId,
        });
        return result.ok ? noContentResponse() : connectorErrorResponse(result.error, requestId);
      },
    ),
    [setConnectorSecretEndpoint.id]: withApiRoute(
      setConnectorSecretEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const { organizationId: tenantId, connectorId } = input.params;
        const result = await connectors.setConnectorSecret({
          actor: principal,
          access: scope,
          tenantId,
          connectorId,
          requestId,
          input: input.body,
        });
        return result.ok ? noContentResponse() : connectorErrorResponse(result.error, requestId);
      },
    ),
  };
};
