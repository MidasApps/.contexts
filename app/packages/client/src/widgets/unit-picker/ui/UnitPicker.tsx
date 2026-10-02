"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { useCan } from "#/entities/permission/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { buildUnitTree, UnitBreadcrumb, unitPathIn, useUnitPath, useUnitTree } from "#/entities/unit/index.ts";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "#/shared/ui/molecules/Popover/Popover.tsx";
import { useSidebar } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "#/shared/ui/organisms/Sidebar/sidebar-menu.tsx";
import { TreeView } from "#/shared/ui/organisms/TreeView/TreeView.tsx";
import { withUnit } from "../model/unit-route.ts";

type TreeQuery = ReturnType<typeof useUnitTree>;

function UnitTreeBody({ query, projectName, selectedId, onSelect }: { query: TreeQuery; projectName: string; selectedId: string | undefined; onSelect: (unitId: string | undefined) => void }) {
  const t = useTranslations("shell.units");
  const locale = useLocale();
  const nodes = useMemo(() => buildUnitTree(query.data ?? [], locale), [query.data, locale]);
  if (query.isPending) return <LoadingState label={t("loading")} rows={4} />;
  if (query.isError) return <ApiErrorState error={query.error} headingLevel={3} frame="plain" onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  if (nodes.length === 0) return <EmptyState icon="network" headingLevel={3} frame="plain" title={t("emptyTitle")} description={t("emptyDescription")} />;
  const expanded = selectedId === undefined ? [] : unitPathIn(query.data, selectedId).map((unit) => unit.id);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="justify-start" aria-pressed={selectedId === undefined} onClick={() => onSelect(undefined)}>
        <Icon name="folder" />
        {t("wholeProject")}
      </Button>
      <div className="max-h-72 overflow-y-auto pr-1">
        <TreeView label={t("treeLabel", { project: projectName })} nodes={nodes} selectedId={selectedId} defaultExpandedIds={expanded} onSelect={onSelect} />
      </div>
    </div>
  );
}

/**
 * Unit picker (SP2 spec §9): the project's unit tree in a popover; choosing a unit writes `?unit=`
 * on the current project or module page (URL state, decision 0012 §3), "Whole project" removes it.
 * Shown inside a project when the viewer can read units there.
 */
export function UnitPicker() {
  const t = useTranslations("shell.units");
  const router = useRouter();
  // Inside the phone sheet there is no room to the right: open below, like the other switchers.
  const { isMobile } = useSidebar();
  const params = router.useRouteParams();
  const routeId = parseRoute(router.useLocationPath())?.id;
  const node = useCurrentNode();
  const projectNode = node?.projectId === undefined ? null : { organizationId: node.organizationId, projectId: node.projectId };
  const context = useAccessContext(node);
  const canRead = useCan("core.unit.read", projectNode);
  const [open, setOpen] = useState(false);
  // The tree loads when the popover opens; the trigger names the path from the access context.
  const tree = useUnitTree(canRead && open ? projectNode : null);
  const current = context.data?.unit;
  const path = useUnitPath(node?.organizationId, current);
  if (projectNode === null || !canRead) return null;
  const select = (unitId: string | undefined) => {
    const route = withUnit(params, unitId, routeId);
    setOpen(false);
    if (route !== null) router.navigate(route);
  };
  const label = current === undefined ? t("wholeProject") : current.name;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton tooltip={label} aria-label={t("pickerTrigger", { unit: label })} className="data-[state=open]:bg-sidebar-accent">
              <Icon name="network" />
              {current === undefined ? <span className="truncate">{label}</span> : <UnitBreadcrumb path={path} className="text-[13px]" />}
              <Icon name="chevron-down" className="ml-auto" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent side={isMobile ? "bottom" : "right"} align="start" className="w-[min(20rem,calc(100vw-2rem))] p-3" aria-label={t("pickerTitle")}>
            <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">{t("pickerTitle")}</p>
            <UnitTreeBody query={tree} projectName={context.data?.project?.name ?? ""} selectedId={current?.id} onSelect={select} />
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
