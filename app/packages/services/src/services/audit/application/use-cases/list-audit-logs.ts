import type { AuditLogEntry, Principal, TenantId } from "@core/contracts";
import type { RequestAccess } from "../../../access/composition.ts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { AuditLogFilters, AuditLogReader } from "../ports/driven/audit-log-reader.ts";

export type ListAuditLogsCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly filters: AuditLogFilters;
  readonly page: PageRequest;
};

export type ListAuditLogs = (command: ListAuditLogsCommand) => Promise<Result<Page<AuditLogEntry>, AccessDeniedError>>;

/**
 * `GET /v1/organizations/{organizationId}/audit-logs` (SP1 spec §6.7): `core.audit-log.read` at
 * the organization; newest first (`-occurredAt` is the only sort), filters `action`, `actorId`
 * and an exclusive `occurredAfter`/`occurredBefore` window (validated by the query contract).
 * Only the tenant log of that organization; platform entries are never listed here.
 */
export const makeListAuditLogs =
  (deps: { reader: AuditLogReader }): ListAuditLogs =>
  async ({ actor, access, tenantId, filters, page }) => {
    const decision = await access.authorize({ principal: actor, permission: "core.audit-log.read", node: { level: "organization", tenantId } });
    if (!decision.allowed) return err(new AccessDeniedError(decision.reason));
    return ok(await deps.reader.list({ tenantId, filters, page }));
  };
