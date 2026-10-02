"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "#/shared/lib/cn.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";

export type SectionNavItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly to: Route;
  readonly current: boolean;
  /** Heading the item sits under (already translated); consecutive items share it. */
  readonly group?: string | undefined;
};

export type SectionNavProps = {
  items: readonly SectionNavItem[];
  /** Access still loading: skeleton rows instead of links (announced with `loadingLabel`). */
  loading?: boolean;
  loadingLabel?: string;
  /** Label of the phone section picker that replaces the links when the items are grouped. */
  pickerLabel?: string;
  className?: string;
};

type Group = { readonly label: string; readonly items: SectionNavItem[] };

const groupsOf = (items: readonly SectionNavItem[]): Group[] =>
  items.reduce<Group[]>((groups, item) => {
    const last = groups.at(-1);
    if (last !== undefined && last.label === (item.group ?? "")) last.items.push(item);
    else groups.push({ label: item.group ?? "", items: [item] });
    return groups;
  }, []);

function SectionLink({ item }: { item: SectionNavItem }) {
  return (
    <RouteLink
      to={item.to}
      aria-current={item.current ? "page" : undefined}
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-xs px-2.5 text-body whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        item.current && "bg-accent font-medium text-accent-foreground hover:bg-accent",
      )}
    >
      <Icon name={item.icon} className="size-4" />
      {item.label}
    </RouteLink>
  );
}

/** Grouped sections from `lg`: a labelled list per heading. */
function GroupedList({ groups }: { groups: readonly Group[] }) {
  const baseId = useId();
  return (
    <div className="hidden flex-col gap-4 lg:flex">
      {groups.map((group, index) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p id={`${baseId}-${String(index)}`} className="px-2.5 text-xs font-medium text-muted-foreground-strong">
            {group.label}
          </p>
          <ul aria-labelledby={`${baseId}-${String(index)}`} className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.id}>
                <SectionLink item={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Grouped sections below `lg`: one picker instead of a row of pills too long for a phone. */
function SectionPicker({ groups, label }: { groups: readonly Group[]; label: string }) {
  const id = useId();
  const router = useRouter();
  const items = groups.flatMap((group) => group.items);
  const current = items.find((item) => item.current);
  return (
    <div className="flex flex-col gap-1.5 lg:hidden">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={current?.id ?? ""}
        onValueChange={(next) => {
          const item = items.find((candidate) => candidate.id === next);
          if (item !== undefined) router.navigate(item.to);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Ungrouped sections: a vertical list from `lg`, a scrolling row of pills below it with the current one in view. */
function PillList({ items, className }: { items: readonly SectionNavItem[]; className?: string | undefined }) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    // `nearest`: never scrolls the page vertically, only the pill row when the current pill is off it.
    listRef.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [items]);
  return (
    <ul ref={listRef} className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0", className)}>
      {items.map((item) => (
        <li key={item.id} className="shrink-0">
          <SectionLink item={item} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Section links of settings/profile pages (navegacao.html secondary nav). The current section
 * carries `aria-current="page"`. Grouped items (decision 0055) show a labelled list per heading
 * from `lg` and a grouped section picker below it; ungrouped items keep the vertical list and the
 * row of pills. Goes inside the `nav` of `SettingsTemplate`.
 */
export function SectionNav({ items, loading = false, loadingLabel, pickerLabel, className }: SectionNavProps) {
  if (loading) {
    return (
      <div role="status" aria-label={loadingLabel} className="flex gap-2 lg:flex-col">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-xs lg:w-full" />
        ))}
      </div>
    );
  }
  if (pickerLabel === undefined || !items.some((item) => item.group !== undefined)) return <PillList items={items} className={className} />;
  const groups = groupsOf(items);
  return (
    <div className={className}>
      <SectionPicker groups={groups} label={pickerLabel} />
      <GroupedList groups={groups} />
    </div>
  );
}
