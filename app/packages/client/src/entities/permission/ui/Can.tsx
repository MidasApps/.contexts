"use client";

import type { Permission } from "@core/contracts";
import type { ReactNode } from "react";
import { usePermissions } from "#/entities/permission/model/use-can.ts";
import type { NodeParams } from "#/shared/api/core-queries.ts";

export type CanProps = {
  permission: Permission;
  /** Node to check; defaults to the node of the URL. */
  node?: NodeParams | null | undefined;
  children: ReactNode;
  /** Rendered when the permission is missing (default: nothing). */
  fallback?: ReactNode;
  /** Rendered while the access context loads (default: nothing, so no action flashes in). */
  pending?: ReactNode;
};

/** Renders `children` only when the viewer holds `permission` at the node (SP2 spec §6). */
export function Can({ permission, node, children, fallback = null, pending = null }: CanProps) {
  const permissions = usePermissions(node);
  if (permissions.status === "pending") return pending;
  return permissions.can(permission) ? children : fallback;
}
