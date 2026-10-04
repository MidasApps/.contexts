"use client";

import type { Organization } from "@core/contracts";
import { useTranslations } from "use-intl";
import { OrganizationAvatar, orderByLastUsed } from "#/entities/organization/index.ts";
import { useAccessContext, useCurrentNode, useMe, useMyOrganizations } from "#/entities/session/index.ts";
import { useIsSwitchingOrganization, useSwitchOrganization } from "#/features/switch-organization/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/shared/ui/molecules/DropdownMenu/DropdownMenu.tsx";
import { useSidebar } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "#/shared/ui/organisms/Sidebar/sidebar-menu.tsx";

function OrganizationItems({ currentId }: { currentId: string | undefined }) {
  const t = useTranslations("shell.switcher");
  const me = useMe();
  const organizations = useMyOrganizations();
  const switchOrganization = useSwitchOrganization();
  const switching = useIsSwitchingOrganization();
  if (organizations.isPending) {
    return (
      <DropdownMenuItem disabled>
        <Spinner decorative />
        {t("loadingOrganizations")}
      </DropdownMenuItem>
    );
  }
  if (organizations.isError) {
    return (
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          void organizations.refetch();
        }}
      >
        <Icon name="refresh" />
        {t("organizationsFailed")}
      </DropdownMenuItem>
    );
  }
  const ordered = orderByLastUsed(organizations.data, me.data?.lastContext.organizationId);
  return (
    <DropdownMenuRadioGroup
      value={currentId ?? ""}
      onValueChange={(organizationId) => {
        // One switch at a time: a second one would refetch every query twice.
        if (organizationId !== currentId && !switching) switchOrganization.mutate(organizationId);
      }}
    >
      {ordered.map((organization: Organization) => (
        <DropdownMenuRadioItem key={organization.id} value={organization.id} disabled={switching} className="gap-2">
          <OrganizationAvatar name={organization.name} size="xs" decorative />
          <span className="truncate">{organization.name}</span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/**
 * Organization switcher at the top of the sidebar (shadcn block `sidebar-07` team switcher): the
 * current organization, the user's organizations (last used first) as a radio group, and links to
 * create one or see all. Picking another runs the switch flow (`useSwitchOrganization`).
 */
export function OrganizationSwitcher() {
  const t = useTranslations("shell.switcher");
  const { isMobile } = useSidebar();
  const node = useCurrentNode();
  const context = useAccessContext(node);
  const current = context.data?.organization;
  const loadingName = node !== null && context.isPending;
  const name = current?.name ?? t("chooseOrganization");
  const switching = useIsSwitchingOrganization();
  return (
    <>
      {/* Outside the menu list: a list may only hold items. */}
      <span role="status" className="sr-only">
        {switching ? t("switching") : null}
      </span>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                tooltip={name}
                aria-label={t("organizationTrigger", { name })}
                aria-busy={switching || undefined}
                className="data-[state=open]:bg-sidebar-accent"
              >
                {current === undefined ? (
                  <span className="grid size-8 shrink-0 place-items-center rounded-xs bg-muted text-muted-foreground">
                    <Icon name="building" />
                  </span>
                ) : (
                  <OrganizationAvatar name={current.name} size="md" decorative className="size-8" />
                )}
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  {loadingName ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    <span className="truncate text-body font-medium">{name}</span>
                  )}
                  <span className="truncate text-caption text-muted-foreground">{t("organizationLabel")}</span>
                </span>
                {switching ? (
                  <Spinner decorative className="ml-auto" />
                ) : (
                  <Icon name="chevron-down" className="ml-auto size-4" />
                )}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={4}
              className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            >
              <DropdownMenuLabel>{t("organizations")}</DropdownMenuLabel>
              <OrganizationItems currentId={node?.organizationId} />
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <RouteLink to={{ id: "organizations" }}>
                  <Icon name="building" />
                  {t("allOrganizations")}
                </RouteLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
