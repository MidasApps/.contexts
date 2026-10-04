// Public API of the connectors context (SP3 Task 21): tenant connectors and their secret store.

export {
  CONNECTORS_COLLECTION,
  createFirestoreConnectorRepository,
} from "./adapters/driven/firestore-connector-repository.ts";
export {
  createInMemoryConnectorRepository,
  createInMemorySecretStore,
} from "./adapters/driven/in-memory-connector-adapters.ts";
export { createLocalSecretStore, LOCAL_SECRETS_COLLECTION } from "./adapters/driven/local-secret-store.ts";
export {
  createLazySecretManagerClient,
  createSecretManagerStore,
  type SecretManagerClientLike,
} from "./adapters/driven/secret-manager-store.ts";
export { buildConnectorsRoutes } from "./adapters/driving/connectors-route-handler.ts";
export {
  CONNECTOR_READ_PERMISSION,
  CONNECTOR_WRITE_PERMISSION,
  type ConnectorsCommand,
  type ConnectorsDeps,
} from "./application/connectors-deps.ts";
export type { ConnectorRepository, SecretStore } from "./application/ports/connector-ports.ts";
export {
  type ConnectorsServices,
  createConnectorsServices,
  createFirebaseConnectorsServices,
  createSecretStoreFor,
} from "./composition.ts";
export {
  ConnectorNotFoundError,
  InvalidConnectorError,
  LocalSecretStoreOutsideLocalError,
} from "./domain/connector-errors.ts";
export { connectorHostIssues, connectorSecretName } from "./domain/connector-policy.ts";
