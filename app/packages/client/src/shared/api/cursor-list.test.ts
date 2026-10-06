import { describe, expect, it } from "vitest";
import { collectAllPages, collectPages, type FetchPage } from "./cursor-list.ts";

const signal = new AbortController().signal;

/** `total` items, one per page, cursors "1", "2", …; the last page has no cursor. */
const pagesOf =
  (total: number): FetchPage<number> =>
  (cursor) => {
    const index = Number(cursor ?? "0");
    const hasMore = index + 1 < total;
    return Promise.resolve({
      data: [index],
      meta: { page: { cursor: hasMore ? String(index + 1) : null, hasMore, limit: 1 } },
    });
  };

describe("collectPages", () => {
  it("reads every page and says nothing was left out", async () => {
    expect(await collectPages(pagesOf(3), signal, 5)).toEqual({ items: [0, 1, 2], truncated: false });
  });

  it("says the list was cut when the page cap stops it with more to read", async () => {
    expect(await collectPages(pagesOf(10), signal, 3)).toEqual({ items: [0, 1, 2], truncated: true });
  });

  it("is not cut when the last page allowed is the last page", async () => {
    expect(await collectPages(pagesOf(3), signal, 3)).toEqual({ items: [0, 1, 2], truncated: false });
  });

  it("keeps collectAllPages as the items only", async () => {
    expect(await collectAllPages(pagesOf(10), signal, 2)).toEqual([0, 1]);
  });
});
