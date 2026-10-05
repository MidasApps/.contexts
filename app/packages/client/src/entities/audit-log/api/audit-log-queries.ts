"use client";

import { type AuditAction, listAuditLogsEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Page size of the audit log table. */
export const AUDIT_LOG_PAGE_LIMIT = 50;

/** Audit log keys under the organization (`["organizations", id, "audit-log", …]`). */
export const auditLogKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "audit-log"),
  list: (organizationId: string, filters: { action?: AuditAction | undefined }): QueryKey =>
    queryKeys.organizationScoped(organizationId, "audit-log", "list", { action: filters.action ?? null }),
};

/** `GET /v1/organizations/{id}/audit-logs`, newest first, optionally of one action; merged pages. */
export const auditLogQuery = (
  callEndpoint: CallEndpoint,
  organizationId: string,
  filters: { action?: AuditAction | undefined } = {},
) =>
  cursorListQuery({
    queryKey: auditLogKeys.list(organizationId, filters),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listAuditLogsEndpoint, {
        params: { organizationId },
        query: {
          ...pageQuery(cursor, AUDIT_LOG_PAGE_LIMIT),
          ...(filters.action === undefined ? {} : { action: filters.action }),
        },
        signal,
      }),
  });

/** The organization's audit log (core.audit-log.read); disabled without an organization id. */
export const useAuditLog = (organizationId: string | undefined, filters: { action?: AuditAction | undefined } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...auditLogQuery(callEndpoint, organizationId ?? "", filters),
    enabled: signedIn && organizationId !== undefined && organizationId !== "",
  });
};
