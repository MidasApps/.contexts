import type { AuditAction, AuditLogEntry, TenantId } from "@core/contracts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";

/** Filters of the tenant audit log; the window bounds are exclusive (ISO 8601 UTC). */
export type AuditLogFilters = {
  readonly action?: AuditAction | undefined;
  readonly actorId?: string | undefined;
  readonly occurredAfter?: string | undefined;
  readonly occurredBefore?: string | undefined;
};

/** Driven port: reads `audit-logs` of one tenant, newest first (`occurredAt desc`, id desc). */
export type AuditLogReader = {
  readonly list: (args: {
    tenantId: TenantId;
    filters: AuditLogFilters;
    page: PageRequest;
  }) => Promise<Page<AuditLogEntry>>;
};
