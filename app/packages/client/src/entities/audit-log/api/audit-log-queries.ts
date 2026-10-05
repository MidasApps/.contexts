"use client";

import { type AuditAction, listAuditLogsEndpoint, listPlatformAuditLogsEndpoint } from "@core/contracts";
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

/** Platform log filters: one action and/or one touched organization. */
export type PlatformAuditLogFilters = { action?: AuditAction | undefined; organizationId?: string | undefined };

/** `GET /v1/admin/audit-logs` (staff, platform.audit-log.read), newest first; merged pages. */
export const platformAuditLogQuery = (callEndpoint: CallEndpoint, filters: PlatformAuditLogFilters = {}) =>
  cursorListQuery({
    queryKey: [
      "admin",
      "audit-log",
      { action: filters.action ?? null, organizationId: filters.organizationId ?? null },
    ],
    fetchPage: async (cursor, signal) =>
      callEndpoint(listPlatformAuditLogsEndpoint, {
        query: {
          ...pageQuery(cursor, AUDIT_LOG_PAGE_LIMIT),
          ...(filters.action === undefined ? {} : { action: filters.action }),
          ...(filters.organizationId === undefined ? {} : { organizationId: filters.organizationId }),
        },
        signal,
      }),
  });

/** The platform audit log; `enabled: false` while the viewer's staff permissions are unknown or missing. */
export const usePlatformAuditLog = (filters: PlatformAuditLogFilters, options: { enabled: boolean }) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({ ...platformAuditLogQuery(callEndpoint, filters), enabled: signedIn && options.enabled });
};
