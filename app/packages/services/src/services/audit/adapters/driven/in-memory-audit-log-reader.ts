import type { AuditLogEntry } from "@core/contracts";
import type { CursorPosition } from "#/services/shared/pagination/cursor.ts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import type { AuditLogFilters, AuditLogReader } from "../../application/ports/driven/audit-log-reader.ts";
import type { InMemoryAuditLogWriter } from "./in-memory-audit-log-writer.ts";

const matches = (entry: AuditLogEntry, filters: AuditLogFilters): boolean =>
  (filters.action === undefined || entry.action === filters.action) &&
  (filters.actorId === undefined || entry.actor.id === filters.actorId) &&
  (filters.occurredAfter === undefined || entry.occurredAt > filters.occurredAfter) &&
  (filters.occurredBefore === undefined || entry.occurredAt < filters.occurredBefore);

// Newest first, like `occurredAt desc, id desc`: negative when `left` comes first.
const compare = (left: CursorPosition, right: CursorPosition): number => {
  if (left[0] !== right[0]) return left[0] > right[0] ? -1 : 1;
  return left[1] === right[1] ? 0 : left[1] > right[1] ? -1 : 1;
};

const positionOf = (entry: AuditLogEntry): CursorPosition => [entry.occurredAt, entry.id];

/** In-memory `AuditLogReader` over the tenant entries of an in-memory writer (unit tests). */
export const createInMemoryAuditLogReader = (deps: { writer: InMemoryAuditLogWriter }): AuditLogReader => ({
  list: ({ tenantId, filters, page }) => {
    const sorted = deps.writer
      .entries("tenant")
      .filter((entry) => entry.tenantId === tenantId && matches(entry, filters))
      .sort((left, right) => compare(positionOf(left), positionOf(right)));
    const { after } = page;
    const remaining = after === undefined ? sorted : sorted.filter((entry) => compare(positionOf(entry), after) > 0);
    return Promise.resolve(
      pageFromOverfetch({ fetched: remaining.slice(0, page.limit + 1), limit: page.limit, positionOf }),
    );
  },
});
