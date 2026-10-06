import { type Connector, type ConnectorId, ConnectorIdSchema } from "@core/contracts";
import { paginateInMemory } from "#/services/shared/pagination/page.ts";
import type { ConnectorRepository, SecretStore } from "../../application/ports/connector-ports.ts";

/** In-memory `ConnectorRepository` for unit tests; newest first like the Firestore index. */
export const createInMemoryConnectorRepository = (): ConnectorRepository & {
  readonly rows: Map<string, Connector>;
} => {
  const rows = new Map<string, Connector>();
  let sequence = 0;
  const own = (tenantId: string) => [...rows.values()].filter((connector) => connector.tenantId === tenantId);
  return {
    rows,
    newId: (): ConnectorId => ConnectorIdSchema.parse(`Cn${String((sequence += 1)).padStart(18, "0")}`),
    get: (_tx, { tenantId, connectorId }) =>
      Promise.resolve(own(tenantId).find((connector) => connector.id === connectorId) ?? null),
    // Descending order through an inverted sort key keeps `paginateInMemory` ascending.
    list: ({ tenantId, page }) =>
      Promise.resolve(
        paginateInMemory({
          items: own(tenantId),
          page,
          positionOf: (connector) => [String(9e15 - Date.parse(connector.createdAt)), connector.id],
        }),
      ),
    listActive: ({ tenantId }) => Promise.resolve(own(tenantId).filter((connector) => connector.status === "active")),
    recordLoad: ({ tenantId, connectorId, lastError }) => {
      const connector = rows.get(connectorId);
      if (connector?.tenantId === tenantId) rows.set(connectorId, { ...connector, lastError });
      return Promise.resolve();
    },
    create: (_tx, { connector }) => void rows.set(connector.id, connector),
    replace: (_tx, { connector }) => void rows.set(connector.id, connector),
    delete: (_tx, { connectorId }) => void rows.delete(connectorId),
  };
};

/** In-memory `SecretStore` for unit tests. */
export const createInMemorySecretStore = (): SecretStore & { readonly values: Map<string, string> } => {
  const values = new Map<string, string>();
  return {
    values,
    put: (name, value) => Promise.resolve(void values.set(name, value)),
    get: (name) => Promise.resolve(values.get(name) ?? null),
    delete: (name) => Promise.resolve(void values.delete(name)),
  };
};
