import type { NavigationRegistry, ShellNavItem } from "#/shared/lib/shell/shell-types.ts";

export type { NavigationRegistry, NavTarget, ShellNavItem } from "#/shared/lib/shell/shell-types.ts";

/** Two navigation items share an id: a composition bug, raised when the app shell is created. */
export class NavigationRegistryError extends Error {
  readonly code = "DUPLICATE_NAV_ITEM";
  readonly itemId: string;

  constructor(itemId: string) {
    super(`DUPLICATE_NAV_ITEM: ${itemId}`);
    this.name = "NavigationRegistryError";
    this.itemId = itemId;
  }
}

const byOrderThenId = (a: ShellNavItem, b: ShellNavItem): number =>
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Builds the navigation registry once (core items + module items).
 * @throws {NavigationRegistryError} for a duplicate item id.
 */
export const createNavigationRegistry = (items: readonly ShellNavItem[]): NavigationRegistry => {
  const seen = new Set<string>();
  for (const entry of items) {
    if (seen.has(entry.id)) throw new NavigationRegistryError(entry.id);
    seen.add(entry.id);
  }
  const sorted = items.toSorted(byOrderThenId);
  return {
    visibleItems: (slot, can) =>
      sorted.filter((entry) => entry.slot === slot && (entry.permission === undefined || can(entry.permission))),
  };
};
