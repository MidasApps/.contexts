import type { SecretStore } from "../../application/ports/connector-ports.ts";

/** gRPC status codes Secret Manager answers (google.rpc.Code). */
const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;

/** The part of `@google-cloud/secret-manager`'s `SecretManagerServiceClient` the store uses (a fake in tests). */
export type SecretManagerClientLike = {
  readonly createSecret: (request: {
    parent: string;
    secretId: string;
    secret: { replication: { automatic: Record<string, never> }; labels: Record<string, string> };
  }) => Promise<unknown>;
  readonly addSecretVersion: (request: { parent: string; payload: { data: Buffer } }) => Promise<unknown>;
  readonly accessSecretVersion: (request: {
    name: string;
  }) => Promise<readonly [{ payload?: { data?: Uint8Array | string | null } | null }, ...unknown[]]>;
  readonly deleteSecret: (request: { name: string }) => Promise<unknown>;
};

const codeOf = (error: unknown): unknown =>
  typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

const decode = (data: Uint8Array | string | null | undefined): string | null => {
  if (data === null || data === undefined) return null;
  return typeof data === "string" ? data : Buffer.from(data).toString("utf8");
};

/**
 * Secret Manager adapter of `SecretStore` (outside `local`, contracts/secrets.md): one
 * secret per connector (`connector-<tenantId>-<connectorId>`), automatic replication, a new
 * version on every put, `latest` on read. Errors other than not-found/already-exists
 * propagate (the route answers 500 without the value; the value is never in an error).
 */
export const createSecretManagerStore = (deps: {
  readonly client: SecretManagerClientLike;
  readonly projectId: string;
}): SecretStore => {
  const secretPath = (name: string) => `projects/${deps.projectId}/secrets/${name}`;
  const ensureSecret = async (name: string): Promise<void> => {
    try {
      await deps.client.createSecret({
        parent: `projects/${deps.projectId}`,
        secretId: name,
        secret: { replication: { automatic: {} }, labels: { owner: "connectors" } },
      });
    } catch (error: unknown) {
      if (codeOf(error) !== ALREADY_EXISTS) throw error;
    }
  };
  return {
    put: async (name, value) => {
      await ensureSecret(name);
      await deps.client.addSecretVersion({ parent: secretPath(name), payload: { data: Buffer.from(value, "utf8") } });
    },
    get: async (name) => {
      try {
        const [version] = await deps.client.accessSecretVersion({ name: `${secretPath(name)}/versions/latest` });
        return decode(version.payload?.data);
      } catch (error: unknown) {
        if (codeOf(error) === NOT_FOUND) return null;
        throw error;
      }
    },
    delete: async (name) => {
      try {
        await deps.client.deleteSecret({ name: secretPath(name) });
      } catch (error: unknown) {
        if (codeOf(error) !== NOT_FOUND) throw error;
      }
    },
  };
};

/** The real client, loaded on first use so `local` never imports the SDK. */
export const createLazySecretManagerClient = (): SecretManagerClientLike => {
  let client: Promise<SecretManagerClientLike> | undefined;
  const load = async (): Promise<SecretManagerClientLike> => {
    const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
    return new SecretManagerServiceClient();
  };
  const get = () => (client ??= load());
  return {
    createSecret: async (request) => (await get()).createSecret(request),
    addSecretVersion: async (request) => (await get()).addSecretVersion(request),
    accessSecretVersion: async (request) => (await get()).accessSecretVersion(request),
    deleteSecret: async (request) => (await get()).deleteSecret(request),
  };
};
