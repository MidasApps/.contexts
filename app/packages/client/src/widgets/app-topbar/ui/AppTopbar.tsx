"use client";

import { Fragment, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { useUnitPath } from "#/entities/unit/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { useModifierKey } from "#/shared/lib/shortcuts/modifier-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Kbd, KbdGroup } from "#/shared/ui/atoms/Kbd/Kbd.tsx";
import { Separator } from "#/shared/ui/atoms/Separator/Separator.tsx";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/shared/ui/molecules/Breadcrumb/Breadcrumb.tsx";
import { SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { usePageLabel } from "../model/use-page-label.ts";

type Crumb = { readonly key: string; readonly label: string | null; readonly to: Route };

/** organization › project › unit path › page (SP2 spec §9), each linking to its home. */
const useCrumbs = (): Crumb[] => {
  const t = useTranslations("shell.units");
  const node = useCurrentNode();
  const context = useAccessContext(node);
  const units = useUnitPath(node?.organizationId, context.data?.unit);
  if (node === null) return [];
  const { organizationId, projectId } = node;
  const crumbs: Crumb[] = [
    { key: "organization", label: context.data?.organization.name ?? null, to: { id: "organization", organizationId } },
  ];
  if (projectId === undefined) return crumbs;
  crumbs.push({
    key: "project",
    label: context.data?.project?.name ?? null,
    to: { id: "project", organizationId, projectId },
  });
  for (const unit of units)
    crumbs.push({
      key: `unit-${unit.id}`,
      label: unit.name ?? t("hiddenUnit"),
      to: { id: "project", organizationId, projectId, unit: unit.id },
    });
  return crumbs;
};

function Breadcrumbs() {
  const t = useTranslations("common.navigation");
  const crumbs = useCrumbs();
  const page = usePageLabel();
  if (crumbs.length === 0 && page === undefined) return null;
  return (
    <Breadcrumb aria-label={t("breadcrumb")} className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          // Earlier levels collapse on small screens; the last two stay (breakpoints.html).
          <Fragment key={crumb.key}>
            <BreadcrumbItem className={index < crumbs.length - 1 ? "hidden min-w-0 md:inline-flex" : "min-w-0"}>
              {crumb.label === null ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <BreadcrumbLink asChild className="truncate">
                  <RouteLink to={crumb.to}>{crumb.label}</RouteLink>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < crumbs.length - 1 || page !== undefined ? (
              <BreadcrumbSeparator className={index < crumbs.length - 1 ? "hidden md:inline-flex" : undefined} />
            ) : null}
          </Fragment>
        ))}
        {page === undefined ? null : (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{page}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export type AppTopbarProps = {
  /** Opens the command palette (the app layout owns its state). */
  onOpenCommandPalette: () => void;
  /** Controls after the palette trigger (the right panel toggle). */
  actions?: ReactNode;
};

/**
 * Topbar of the user area (layout.html, 56 px): sidebar toggle, breadcrumbs and the command
 * palette trigger with its shortcut (⌘K on Apple platforms, Ctrl+K elsewhere).
 */
export function AppTopbar({ onOpenCommandPalette, actions }: AppTopbarProps) {
  const t = useTranslations("shell.commandPalette");
  const modifier = useModifierKey();
  return (
    <>
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="me-1 data-[orientation=vertical]:h-4" />
      <Breadcrumbs />
      <div className="ms-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCommandPalette}
          aria-keyshortcuts={`${modifier.aria}+K`}
          className="gap-2 text-muted-foreground-strong"
        >
          <Icon name="search" />
          <span className="max-sm:sr-only">{t("open")}</span>
          <KbdGroup className="hidden sm:inline-flex">
            <Kbd>{modifier.label}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
        {actions}
      </div>
    </>
  );
}
