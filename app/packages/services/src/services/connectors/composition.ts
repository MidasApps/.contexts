// Composition root of the connectors context (SP3 Task 21, decision 0027).
import type { AuditWriter } from "../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../shared/clock/clock.ts";
import type { FirebaseAdmin } from "../shared/firebase/firebase-admin.ts";
import { createFirestoreUnitOfWork, type UnitOfWork } from "../shared/firestore/unit-of-work.ts";
import { createFirestoreConnectorRepository } from "./adapters/driven/firestore-connector-repository.ts";
import { createLocalSecretStore } from "./adapters/driven/local-secret-store.ts";
import { createLazySecretManagerClient, createSecretManagerStore } from "./adapters/driven/secret-manager-store.ts";
import type { ConnectorsDeps } from "./application/connectors-deps.ts";
import type { ConnectorRepository, SecretStore } from "./application/ports/connector-ports.ts";
import { type CreateConnector, makeCreateConnector } from "./application/use-cases/create-connector.ts";
import { type DeleteConnector, makeDeleteConnector } from "./application/use-cases/delete-connector.ts";
import { type GetConnector, type ListConnectors, makeGetConnector, makeListConnectors } from "./application/use-cases/list-connectors.ts";
import { makeSetConnectorSecret, type SetConnectorSecret } from "./application/use-cases/set-connector-secret.ts";
import { makeUpdateConnector, type UpdateConnector } from "./application/use-cases/update-connector.ts";

export type ConnectorsServices = {
  readonly listConnectors: ListConnectors;
  readonly getConnector: GetConnector;
  readonly createConnector: CreateConnector;
  readonly updateConnector: UpdateConnector;
  readonly deleteConnector: DeleteConnector;
  readonly setConnectorSecret: SetConnectorSecret;
  /** Server-side reads for the agent runtime (no authorization: the tenant comes from the verified context). */
  readonly listActiveConnectors: ConnectorRepository["listActive"];
  readonly secrets: Pick<SecretStore, "get">;
};

/** Binds the connectors use cases (in-memory adapters in unit tests). */
export const createConnectorsServices = (deps: ConnectorsDeps): ConnectorsServices => ({
  listConnectors: makeListConnectors(deps),
  getConnector: makeGetConnector(deps),
  createConnector: makeCreateConnector(deps),
  updateConnector: makeUpdateConnector(deps),
  deleteConnector: makeDeleteConnector(deps),
  setConnectorSecret: makeSetConnectorSecret(deps),
  listActiveConnectors: deps.connectors.listActive,
  secrets: { get: deps.secrets.get },
});

/**
 * The secret store of an environment: the Firestore-emulator store in `local`, Secret
 * Manager everywhere else (contracts/secrets.md); never a silent fallback between them.
 */
export const createSecretStoreFor = (args: { readonly firebase: FirebaseAdmin; readonly appEnv: string; readonly projectId: string }): SecretStore =>
  args.appEnv === "local"
    ? createLocalSecretStore({ firestore: args.firebase.firestore, appEnv: args.appEnv })
    : createSecretManagerStore({ client: createLazySecretManagerClient(), projectId: args.projectId });

/** Firestore + secret store services (web `/v1` routes and the Mastra ports). */
export const createFirebaseConnectorsServices = (args: {
  readonly firebase: FirebaseAdmin;
  readonly env: { readonly APP_ENV: string; readonly FIREBASE_PROJECT_ID: string };
  readonly audit: AuditWriter;
  readonly clock: Clock;
  readonly unitOfWork?: UnitOfWork;
}): ConnectorsServices =>
  createConnectorsServices({
    connectors: createFirestoreConnectorRepository({ firestore: args.firebase.firestore }),
    secrets: createSecretStoreFor({ firebase: args.firebase, appEnv: args.env.APP_ENV, projectId: args.env.FIREBASE_PROJECT_ID }),
    audit: args.audit,
    unitOfWork: args.unitOfWork ?? createFirestoreUnitOfWork({ firestore: args.firebase.firestore }),
    clock: args.clock,
  });
