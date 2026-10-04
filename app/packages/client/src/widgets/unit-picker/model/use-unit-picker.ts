"use client";

import { useState } from "react";
import { useCan } from "#/entities/permission/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { useUnitPath, useUnitTree } from "#/entities/unit/index.ts";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { withUnit } from "./unit-route.ts";

/**
 * State of the unit picker: whether it shows (inside a project, for viewers who can read its
 * units), the unit the access context is on with its path, the tree (read once the popover opens)
 * and `select`, which writes `?unit=` on the current page and closes the popover.
 */
export const useUnitPicker = () => {
  const router = useRouter();
  const params = router.useRouteParams();
  const routeId = parseRoute(router.useLocationPath())?.id;
  const node = useCurrentNode();
  const projectNode =
    node?.projectId === undefined ? null : { organizationId: node.organizationId, projectId: node.projectId };
  const context = useAccessContext(node);
  const canRead = useCan("core.unit.read", projectNode);
  const [open, setOpen] = useState(false);
  // The tree loads when the popover opens; the trigger names the path from the access context.
  const tree = useUnitTree(canRead && open ? projectNode : null);
  const current = context.data?.unit;
  const path = useUnitPath(node?.organizationId, current);
  const select = (unitId: string | undefined) => {
    const route = withUnit(params, unitId, routeId);
    setOpen(false);
    if (route !== null) router.navigate(route);
  };
  return {
    visible: projectNode !== null && canRead,
    open,
    setOpen,
    tree,
    current,
    path,
    projectName: context.data?.project?.name ?? "",
    select,
  };
};
