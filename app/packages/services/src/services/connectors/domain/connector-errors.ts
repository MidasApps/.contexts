import type { ErrorDetail } from "@core/contracts";

/** The connector does not exist in the organization (never reveals another tenant's). */
export class ConnectorNotFoundError extends Error {
  readonly code = "CONNECTOR_NOT_FOUND";

  constructor(options?: ErrorOptions) {
    super("connector not found", options);
    this.name = "ConnectorNotFoundError";
  }
}

/** The connector breaks a rule the schema cannot check (hosts, config of another type). */
export class InvalidConnectorError extends Error {
  readonly code = "INVALID_CONNECTOR";
  readonly details: readonly ErrorDetail[];

  constructor(details: readonly ErrorDetail[], options?: ErrorOptions) {
    super(`invalid connector: ${details.map((detail) => `${detail.field} ${detail.issue}`).join(", ")}`, options);
    this.name = "InvalidConnectorError";
    this.details = details;
  }
}

/** The local secret store was built outside `APP_ENV=local` (a wiring bug; fails at startup). */
export class LocalSecretStoreOutsideLocalError extends Error {
  readonly code = "LOCAL_SECRET_STORE_OUTSIDE_LOCAL";

  constructor(appEnv: string) {
    super(`the local secret store is refused outside local (APP_ENV=${appEnv})`);
    this.name = "LocalSecretStoreOutsideLocalError";
  }
}
