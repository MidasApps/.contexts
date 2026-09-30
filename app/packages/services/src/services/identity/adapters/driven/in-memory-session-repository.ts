import { SessionIdSchema } from "@core/contracts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { SessionRepository } from "../../application/ports/driven/session-repository.ts";
import type { SessionRecord } from "../../domain/session-record.schema.ts";

export type InMemorySessionRepository = SessionRepository & {
  /** Inspection: every stored record, hashes included, in creation order. */
  readonly all: () => readonly SessionRecord[];
};

// Newest first, like the Firestore query (`createdAt desc`, id desc).
const newestFirst = (left: SessionRecord, right: SessionRecord): number =>
  left.createdAt === right.createdAt ? (left.id < right.id ? 1 : -1) : left.createdAt < right.createdAt ? 1 : -1;

const isAfter = (record: SessionRecord, after: readonly [string, string]): boolean =>
  record.createdAt === after[0] ? record.id < after[1] : record.createdAt < after[0];

/** In-memory `SessionRepository` for unit tests; transactions are ignored. */
export const createInMemorySessionRepository = (): InMemorySessionRepository => {
  const rows = new Map<string, SessionRecord>();
  let sequence = 0;
  const find = (predicate: (record: SessionRecord) => boolean) => Promise.resolve([...rows.values()].find(predicate) ?? null);
  const update = (id: string, patch: Partial<SessionRecord>) => {
    const row = rows.get(id);
    if (row !== undefined) rows.set(id, { ...row, ...patch });
  };
  return {
    newId: () => SessionIdSchema.parse(`session-${String((sequence += 1)).padStart(3, "0")}`),
    create: (record) => Promise.resolve(void rows.set(record.id, record)),
    get: (_tx, id) => Promise.resolve(rows.get(id) ?? null),
    findByCookieHash: (hash) => find((record) => record.cookieHash === hash),
    findBySecretHash: (hash) => find((record) => record.secretHash === hash),
    findByPreviousSecretHash: (hash) => find((record) => record.previousSecretHashes.includes(hash)),
    listOpen: ({ uid, page }) => {
      const matching = [...rows.values()]
        .filter((record) => record.uid === uid && record.revokedAt === null)
        .sort(newestFirst)
        .filter((record) => page.after === undefined || isAfter(record, page.after));
      return Promise.resolve(pageFromOverfetch({ fetched: matching.slice(0, page.limit + 1), limit: page.limit, positionOf: (r) => [r.createdAt, r.id] }));
    },
    touch: ({ id, lastSeenAt }) => Promise.resolve(update(id, { lastSeenAt })),
    rotate: (_tx, { id, ...patch }) => update(id, { ...patch, previousSecretHashes: [...patch.previousSecretHashes] }),
    revoke: (_tx, { id, revokedAt }) => Promise.resolve(update(id, { revokedAt })),
    revokeAllOf: ({ uid, revokedAt }) => {
      const open = [...rows.values()].filter((record) => record.uid === uid && record.revokedAt === null);
      for (const record of open) update(record.id, { revokedAt });
      return Promise.resolve(open.length);
    },
    all: () => [...rows.values()],
  };
};
