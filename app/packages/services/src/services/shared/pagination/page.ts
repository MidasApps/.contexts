import type { PageMeta } from "@core/contracts";
import { type CursorPosition, encodeCursor } from "./cursor.ts";

/** One page of a cursor-paginated list, as repositories return it. */
export type Page<T> = { readonly items: readonly T[]; readonly nextCursor: string | null };

/** What a list use case receives from the handler: a decoded position and the page size. */
export type PageRequest = { readonly after: CursorPosition | undefined; readonly limit: number };

const comparePositions = (left: CursorPosition, right: CursorPosition): number =>
  left[0] === right[0] ? compareText(left[1], right[1]) : compareText(left[0], right[0]);

// Code-unit order, like Firestore's string ordering.
const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Builds a page from items fetched with one extra item (`limit + 1`): the extra item only
 * says that more exist; the cursor points at the last returned item.
 */
export const pageFromOverfetch = <T>(args: {
  fetched: readonly T[];
  limit: number;
  positionOf: (item: T) => CursorPosition;
}): Page<T> => {
  const items = args.fetched.slice(0, args.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: args.fetched.length > args.limit && last !== undefined ? encodeCursor(args.positionOf(last)) : null,
  };
};

/**
 * Pages an in-memory list sorted by `(sortValue, id)` ascending (registries, fakes).
 * @example paginateInMemory({ items: permissions, page, positionOf: (p) => [p.id, p.id] })
 */
export const paginateInMemory = <T>(args: {
  items: readonly T[];
  page: PageRequest;
  positionOf: (item: T) => CursorPosition;
}): Page<T> => {
  const { after, limit } = args.page;
  const sorted = [...args.items].sort((left, right) => comparePositions(args.positionOf(left), args.positionOf(right)));
  const remaining =
    after === undefined ? sorted : sorted.filter((item) => comparePositions(args.positionOf(item), after) > 0);
  return pageFromOverfetch({ fetched: remaining.slice(0, limit + 1), limit, positionOf: args.positionOf });
};

/** `meta` of a list response (contracts/api.md §9.1). */
export const pageMeta = (page: Page<unknown>, limit: number): { page: PageMeta } => ({
  page: { cursor: page.nextCursor, hasMore: page.nextCursor !== null, limit },
});
