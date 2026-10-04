import { type ApiKey, ApiKeyIdSchema } from "@core/contracts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { ApiKeyRepository, StoredApiKey } from "../../application/ports/driven/api-key-repository.ts";

type Row = { apiKey: ApiKey; secretHash: string };

export type InMemoryApiKeyRepository = ApiKeyRepository & {
  /** Inspection: the stored row, hash included. */
  readonly rowOf: (id: string) => Row | undefined;
};

const newestFirst = (left: ApiKey, right: ApiKey): number =>
  left.createdAt === right.createdAt ? (left.id < right.id ? 1 : -1) : left.createdAt < right.createdAt ? 1 : -1;

const isAfter = (key: ApiKey, after: readonly [string, string]): boolean =>
  key.createdAt === after[0] ? key.id < after[1] : key.createdAt < after[0];

/** In-memory `ApiKeyRepository` for unit tests; transactions are ignored. */
export const createInMemoryApiKeyRepository = (): InMemoryApiKeyRepository => {
  const rows = new Map<string, Row>();
  let sequence = 0;
  const patch = (id: string, change: Partial<ApiKey>) => {
    const row = rows.get(id);
    if (row !== undefined) row.apiKey = { ...row.apiKey, ...change };
  };
  return {
    newId: () => ApiKeyIdSchema.parse(`api-key-${String((sequence += 1)).padStart(3, "0")}`),
    create: (_tx, { apiKey, secretHash }) => void rows.set(apiKey.id, { apiKey, secretHash }),
    get: (_tx, id) => Promise.resolve(rows.get(id)?.apiKey ?? null),
    findByPublicId: (publicId) => {
      const row = [...rows.values()].find((candidate) => candidate.apiKey.publicId === publicId);
      return Promise.resolve<StoredApiKey | null>(row === undefined ? null : { ...row });
    },
    list: ({ tenantId, page }) => {
      const matching = [...rows.values()]
        .map((row) => row.apiKey)
        .filter((key) => key.tenantId === tenantId)
        .sort(newestFirst)
        .filter((key) => page.after === undefined || isAfter(key, page.after));
      return Promise.resolve(
        pageFromOverfetch({
          fetched: matching.slice(0, page.limit + 1),
          limit: page.limit,
          positionOf: (k) => [k.createdAt, k.id],
        }),
      );
    },
    listActiveOfOwner: ({ tenantId, ownerUid }) =>
      Promise.resolve(
        [...rows.values()]
          .map((row) => row.apiKey)
          .filter((key) => key.tenantId === tenantId && key.ownerUid === ownerUid && key.status === "active"),
      ),
    revoke: (_tx, { id, reason, updatedAt }) => patch(id, { status: "revoked", revokedReason: reason, updatedAt }),
    touchLastUsed: ({ id, lastUsedAt }) => Promise.resolve(patch(id, { lastUsedAt })),
    rowOf: (id) => rows.get(id),
  };
};
