import { NAV_GROUPS, type NavGroup } from "./shell-types.ts";

export type NavItemGroup<T> = { readonly group: NavGroup; readonly items: readonly T[] };

/**
 * Items under their navigation headings (decision 0054): groups in `NAV_GROUPS` order, items in
 * the order given; an item without a group (a module's) sits under `other`, after the rest.
 */
export const groupNavItems = <T>(items: readonly T[], groupOf: (item: T) => NavGroup | undefined): NavItemGroup<T>[] =>
  NAV_GROUPS.flatMap((group): NavItemGroup<T>[] => {
    const members = items.filter((item) => (groupOf(item) ?? "other") === group);
    return members.length === 0 ? [] : [{ group, items: members }];
  });
