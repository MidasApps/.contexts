import type { Connector, ConnectorId, ConnectorLoadError, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";

/** Firestore `connectors/{autoId}` (tenant data; Security Rules deny clients). */
export type ConnectorRepository = {
  readonly newId: () => ConnectorId;
  /** `null` for a missing connector or one of another tenant. */
  readonly get: (
    tx: Transaction | undefined,
    key: { tenantId: TenantId; connectorId: ConnectorId },
  ) => Promise<Connector | null>;
  /** Newest first (`tenantId + createdAt desc`). */
  readonly list: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<Connector>>;
  /** Active connectors of a tenant (the agent runtime's toolsets). */
  readonly listActive: (args: { tenantId: TenantId }) => Promise<readonly Connector[]>;
  /**
   * Stores (or clears with `null`) why the agent runtime could not load a connector. Not an edit:
   * `updatedAt` stays. A connector of another tenant, or a deleted one, is left alone.
   */
  readonly recordLoad: (args: {
    tenantId: TenantId;
    connectorId: ConnectorId;
    lastError: ConnectorLoadError | null;
  }) => Promise<void>;
  readonly create: (tx: Transaction, args: { connector: Connector }) => void;
  readonly replace: (tx: Transaction, args: { connector: Connector; actorId: string }) => void;
  readonly delete: (tx: Transaction, args: { connectorId: ConnectorId }) => void;
};

/**
 * Secret values by name (contracts/secrets.md): Secret Manager remotely, a local
 * emulator collection in `local`. Values never reach logs, errors or API responses.
 */
export type SecretStore = {
  /** Creates the secret on first use, then adds a new version. */
  readonly put: (name: string, value: string) => Promise<void>;
  /** The latest version, or `null` when the secret does not exist. */
  readonly get: (name: string) => Promise<string | null>;
  /** Deletes every version; a missing secret is not an error. */
  readonly delete: (name: string) => Promise<void>;
};
