// Connectors `/v1` descriptors (SP3 spec §9, decision 0027 amendment of Task 21).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { ConnectorIdSchema, ConnectorSchema } from "./connector.schema.ts";
import {
  CreateConnectorInputSchema,
  SetConnectorSecretInputSchema,
  UpdateConnectorInputSchema,
} from "./connector-input.schema.ts";

const organizationId = OrganizationIdSchema.meta(none("Organization that owns the connectors."));
const organizationParams = z.object({ organizationId });
const connectorParams = z.object({ organizationId, connectorId: ConnectorIdSchema.meta(none("Connector id.")) });
const FORBIDDEN = ["FORBIDDEN"] as const;

export const listConnectorsEndpoint = defineEndpoint({
  id: "connectors.list",
  method: "GET",
  path: "/v1/organizations/{organizationId}/connectors",
  auth: "principal",
  params: organizationParams,
  query: PageQuerySchema,
  responses: { 200: listEnvelope(ConnectorSchema) },
  errors: { 403: FORBIDDEN },
  summary: "Lists the organization's connectors, newest first (core.connector.read). Secrets are never returned.",
});

export const createConnectorEndpoint = defineEndpoint({
  id: "connectors.create",
  method: "POST",
  path: "/v1/organizations/{organizationId}/connectors",
  auth: "principal",
  params: organizationParams,
  body: CreateConnectorInputSchema,
  responses: { 201: dataEnvelope(ConnectorSchema) },
  errors: { 403: FORBIDDEN },
  idempotency: "optional",
  summary: "Registers a connector (core.connector.write): https only, every endpoint host in allowedHosts.",
});

export const getConnectorEndpoint = defineEndpoint({
  id: "connectors.get",
  method: "GET",
  path: "/v1/organizations/{organizationId}/connectors/{connectorId}",
  auth: "principal",
  params: connectorParams,
  responses: { 200: dataEnvelope(ConnectorSchema) },
  errors: { 403: FORBIDDEN, 404: ["NOT_FOUND"] },
  summary: "Reads one connector (core.connector.read).",
});

export const updateConnectorEndpoint = defineEndpoint({
  id: "connectors.update",
  method: "PATCH",
  path: "/v1/organizations/{organizationId}/connectors/{connectorId}",
  auth: "principal",
  params: connectorParams,
  body: UpdateConnectorInputSchema,
  responses: { 200: dataEnvelope(ConnectorSchema) },
  errors: { 403: FORBIDDEN, 404: ["NOT_FOUND"] },
  summary: "Changes a connector's name, status, tool allowlist or config (core.connector.write).",
});

export const deleteConnectorEndpoint = defineEndpoint({
  id: "connectors.delete",
  method: "DELETE",
  path: "/v1/organizations/{organizationId}/connectors/{connectorId}",
  auth: "principal",
  params: connectorParams,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: ["NOT_FOUND"] },
  summary: "Deletes a connector and its secret (core.connector.write).",
});

export const setConnectorSecretEndpoint = defineEndpoint({
  id: "connectors.setSecret",
  method: "PUT",
  path: "/v1/organizations/{organizationId}/connectors/{connectorId}/secret",
  auth: "principal",
  params: connectorParams,
  body: SetConnectorSecretInputSchema,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: ["NOT_FOUND"] },
  summary: "Stores or replaces the connector's secret in the secret store (core.connector.write); write-only.",
});

export const CONNECTORS_ENDPOINTS: readonly EndpointDefinition[] = [
  listConnectorsEndpoint,
  createConnectorEndpoint,
  getConnectorEndpoint,
  updateConnectorEndpoint,
  deleteConnectorEndpoint,
  setConnectorSecretEndpoint,
];
