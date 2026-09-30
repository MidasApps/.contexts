import { describe, expect, it } from "vitest";
import { decodeCursor } from "./cursor.ts";
import { pageMeta, paginateInMemory } from "./page.ts";

const items = [
  { id: "c", name: "Bravo" },
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
];
const positionOf = (item: { id: string; name: string }) => [item.name, item.id] as const;

describe("paginateInMemory", () => {
  it("sorts by (sortValue, id) and continues after the cursor", () => {
    const first = paginateInMemory({ items, page: { after: undefined, limit: 2 }, positionOf });
    expect(first.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(pageMeta(first, 2)).toEqual({ page: { cursor: first.nextCursor, hasMore: true, limit: 2 } });

    const after = decodeCursor(first.nextCursor ?? "") ?? undefined;
    const second = paginateInMemory({ items, page: { after, limit: 2 }, positionOf });
    expect(second.items.map((item) => item.id)).toEqual(["c"]);
    expect(second.nextCursor).toBeNull();
  });
});
