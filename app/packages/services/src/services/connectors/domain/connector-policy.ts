import type { Connector, ErrorDetail } from "@core/contracts";

/**
 * Connector rules the schema cannot express alone (SP3 spec §9, decision 0027):
 * every endpoint the connector calls must be https (the schema checks it) and its
 * host must be in `allowedHosts`, so no request leaves the allowlist from the start.
 */

type ConnectorConfigOf<T extends Connector["type"]> = Extract<Connector, { type: T }>["config"];

/** URLs the connector will call first, by type (the spec URL for OpenAPI; the servers are checked at load). */
const endpointUrlsOf = (connector: Pick<Connector, "type" | "config">): { field: string; url: string }[] => {
  switch (connector.type) {
    case "openapi":
      return [{ field: "config.specUrl", url: (connector.config as ConnectorConfigOf<"openapi">).specUrl }];
    case "mcp":
      return [{ field: "config.url", url: (connector.config as ConnectorConfigOf<"mcp">).url }];
    case "browser":
      return [{ field: "config.url", url: (connector.config as ConnectorConfigOf<"browser">).url }];
    case "postgres":
      return [];
  }
};

const allowedHostsOf = (connector: Pick<Connector, "type" | "config">): readonly string[] =>
  "allowedHosts" in connector.config ? connector.config.allowedHosts : [];

/** `VALIDATION_FAILED` details for endpoint hosts outside `allowedHosts` (or a non-default port). */
export const connectorHostIssues = (connector: Pick<Connector, "type" | "config">): ErrorDetail[] => {
  const allowed = new Set(allowedHostsOf(connector));
  return endpointUrlsOf(connector).flatMap(({ field, url }) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return [{ field, issue: "HTTPS_REQUIRED" }];
    if (parsed.port !== "") return [{ field, issue: "DEFAULT_PORT_REQUIRED" }];
    return allowed.has(parsed.hostname.toLowerCase()) ? [] : [{ field, issue: "HOST_NOT_ALLOWED" }];
  });
};

/** Secret Manager id of a connector's secret (`connector-<tenantId>-<connectorId>`, decision 0027). */
export const connectorSecretName = (connector: Pick<Connector, "tenantId" | "id">): string =>
  `connector-${connector.tenantId}-${connector.id}`;
