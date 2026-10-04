"use client";

import type { Permission } from "@core/contracts";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { accessContextQuery, type NodeParams } from "#/shared/api/core-queries.ts";
import { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** What the viewer may do at a node; `can` is `false` for everything until the context loads. */
export type PermissionsState = {
  readonly status: "pending" | "error" | "success";
  readonly can: (permission: Permission) => boolean;
  readonly error: unknown;
  readonly refetch: () => void;
};

const denyAll = (): boolean => false;
const NO_NODE: NodeParams = { organizationId: "" };

/**
 * Effective permissions at `node` (default: the node of the URL), read from the access context the
 * shell already fetches (one request for navigation, the time zone and every `can()`). Outside an
 * organization everything is denied: tenant permissions only exist at a node (SP1 §5).
 */
export const usePermissions = (node?: NodeParams | null): PermissionsState => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const urlNode = useCurrentNode();
  const target = node === undefined ? urlNode : node;
  const query = useQuery({
    ...accessContextQuery(callEndpoint, target ?? NO_NODE),
    enabled: signedIn && target !== null,
  });
  const granted = useMemo(() => new Set<string>(query.data?.permissions ?? []), [query.data]);
  const can = useCallback((permission: Permission) => granted.has(permission), [granted]);
  const { refetch } = query;
  return {
    status: target === null ? "success" : query.status,
    can: query.data === undefined ? denyAll : can,
    error: query.error,
    refetch: () => void refetch(),
  };
};

/**
 * `true` when the viewer holds `permission` at the URL node (or `node`). Hides actions the user
 * cannot take; the API still authorizes every call (`authorize()` is the only decision, SP1 §5.2).
 */
export const useCan = (permission: Permission, node?: NodeParams | null): boolean =>
  usePermissions(node).can(permission);
