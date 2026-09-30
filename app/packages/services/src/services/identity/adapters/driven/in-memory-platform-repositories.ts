import { ImpersonationSessionIdSchema, type ImpersonationSession, type PlatformStaff } from "@core/contracts";
import type { ImpersonationSessionRepository } from "../../application/ports/driven/impersonation-session-repository.ts";
import type { PlatformStaffRepository } from "../../application/ports/driven/platform-staff-repository.ts";

export type InMemoryPlatformStaffRepository = PlatformStaffRepository & { readonly rowOf: (uid: string) => PlatformStaff | undefined };

/**
 * In-memory `PlatformStaffRepository` for unit tests. `onWrite` mirrors each write into the
 * access test store, so `authorize()` sees the staff doc the use case wrote.
 */
export const createInMemoryPlatformStaffRepository = (args: { onWrite?: (staff: PlatformStaff) => void } = {}): InMemoryPlatformStaffRepository => {
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
    rowOf: (id) => rows.get(id),
  };
};
