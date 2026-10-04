import { type ImpersonationSession, ImpersonationSessionIdSchema, type PlatformStaff } from "@core/contracts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { ImpersonationSessionRepository } from "../../application/ports/driven/impersonation-session-repository.ts";
import type { PlatformStaffRepository } from "../../application/ports/driven/platform-staff-repository.ts";

export type InMemoryPlatformStaffRepository = PlatformStaffRepository & {
  readonly rowOf: (uid: string) => PlatformStaff | undefined;
};

/**
 * In-memory `PlatformStaffRepository` for unit tests. `onWrite` mirrors each write into the
 * access test store, so `authorize()` sees the staff doc the use case wrote.
 */
export const createInMemoryPlatformStaffRepository = (
  args: { onWrite?: (staff: PlatformStaff) => void } = {},
): InMemoryPlatformStaffRepository => {
  const rows = new Map<string, PlatformStaff>();
  return {
    get: (_tx, uid) => Promise.resolve(rows.get(uid) ?? null),
    put: (_tx, { staff }) => {
      rows.set(staff.uid, staff);
      args.onWrite?.(staff);
    },
    rowOf: (uid) => rows.get(uid),
  };
};

const newestFirst = (left: ImpersonationSession, right: ImpersonationSession): number =>
  left.createdAt === right.createdAt ? (left.id < right.id ? 1 : -1) : left.createdAt < right.createdAt ? 1 : -1;

export type InMemoryImpersonationSessionRepository = ImpersonationSessionRepository & {
  readonly rowOf: (id: string) => ImpersonationSession | undefined;
};

/** In-memory `ImpersonationSessionRepository`; ids are `imp-1`, `imp-2`, … and writes mirror through `onWrite`. */
export const createInMemoryImpersonationSessionRepository = (
  args: { onWrite?: (session: ImpersonationSession) => void } = {},
): InMemoryImpersonationSessionRepository => {
  const rows = new Map<string, ImpersonationSession>();
  let sequence = 0;
  const write = (session: ImpersonationSession): void => {
    rows.set(session.id, session);
    args.onWrite?.(session);
  };
  return {
    newId: () => ImpersonationSessionIdSchema.parse(`imp-${(sequence += 1)}`),
    create: (_tx, { session }) => write(session),
    get: (_tx, id) => Promise.resolve(rows.get(id) ?? null),
    end: (_tx, { id, endedAt }) => {
      const row = rows.get(id);
      if (row !== undefined) write({ ...row, endedAt });
    },
    listRecent: ({ after, limit }) => {
      const sorted = [...rows.values()].sort(newestFirst);
      const remaining =
        after === undefined
          ? sorted
          : sorted.filter((row) => row.createdAt < after[0] || (row.createdAt === after[0] && row.id < after[1]));
      return Promise.resolve(
        pageFromOverfetch({
          fetched: remaining.slice(0, limit + 1),
          limit,
          positionOf: (row) => [row.createdAt, row.id],
        }),
      );
    },
    listOpen: ({ now, limit }) =>
      Promise.resolve(
        [...rows.values()]
          .filter((row) => row.endedAt === null && Date.parse(row.expiresAt) > now.getTime())
          .sort((left, right) => (left.expiresAt < right.expiresAt ? -1 : 1))
          .slice(0, limit),
      ),
    rowOf: (id) => rows.get(id),
  };
};
