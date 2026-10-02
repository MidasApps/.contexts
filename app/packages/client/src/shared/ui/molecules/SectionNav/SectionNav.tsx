"use client";

import { cn } from "#/shared/lib/cn.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";

export type SectionNavItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly to: Route;
  readonly current: boolean;
};

export type SectionNavProps = {
  items: readonly SectionNavItem[];
  /** Access still loading: skeleton rows instead of links (announced with `loadingLabel`). */
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
};

/**
 * Section links of settings/profile pages (navegacao.html secondary nav): a vertical list from
 * `lg` (the side column of `SettingsTemplate`), a horizontally scrolling row of pills below it.
 * The current section carries `aria-current="page"`. Goes inside the `nav` of `SettingsTemplate`.
 */
export function SectionNav({ items, loading = false, loadingLabel, className }: SectionNavProps) {
  if (loading) {
    return (
      <div role="status" aria-label={loadingLabel} className="flex gap-2 lg:flex-col">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-xs lg:w-full" />
        ))}
      </div>
    );
  }
  return (
    <ul className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0", className)}>
      {items.map((item) => (
        <li key={item.id} className="shrink-0">
          <RouteLink
            to={item.to}
            aria-current={item.current ? "page" : undefined}
            className={cn(
              "flex min-h-8 items-center gap-2 rounded-xs px-2.5 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              item.current && "bg-accent font-medium text-accent-foreground hover:bg-accent",
            )}
          >
            <Icon name={item.icon} className="size-4" />
            {item.label}
          </RouteLink>
        </li>
      ))}
    </ul>
  );
}
