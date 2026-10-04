import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { decodeCursor } from "../../../shared/pagination/cursor.ts";
import { createInMemoryConsoleStores } from "../../adapters/driven/in-memory-console-stores.ts";
import { makeListOrganizationsAdmin, ORGANIZATION_SCAN_BUDGET } from "./list-organizations-admin.ts";

const idOf = (index: number): string => `Org${String(index).padStart(17, "0")}`;

// Two matches: one inside the first read budget and one beyond it.
const setup = () => {
  const total = ORGANIZATION_SCAN_BUDGET + 500;
  const organizations = Array.from({ length: total }, (_, index) => ({
    id: idOf(index),
    name: index === 10 || index === total - 1 ? "Needle" : "Hay",
  }));
  const memory = createInMemoryConsoleStores({ organizations });
  return {
    list: makeListOrganizationsAdmin({ ...memory.stores, clock: fixedClock("2026-10-01T12:00:00.000Z") }),
    total,
  };
};

describe("listOrganizationsAdmin with a filter", () => {
  it("answers a short page with a cursor when the read budget ends, and the next page continues the scan", async () => {
    const { list, total } = setup();
    const first = await list({ page: { after: undefined, limit: 20 }, filter: { query: "needle" } });
    expect(first.items.map((org) => org.id)).toEqual([idOf(10)]);
    expect(first.nextCursor).not.toBeNull();
    const after = decodeCursor(first.nextCursor ?? "");
    expect(after?.[1]).toBe(idOf(ORGANIZATION_SCAN_BUDGET - 1));
    const second = await list({ page: { after: after ?? undefined, limit: 20 }, filter: { query: "needle" } });
    expect(second.items.map((org) => org.id)).toEqual([idOf(total - 1)]);
    expect(second.nextCursor).toBeNull();
  });

  it("lists every live organization by id when nothing is asked", async () => {
    const { list } = setup();
    const page = await list({ page: { after: undefined, limit: 2 } });
    expect(page.items.map((org) => org.id)).toEqual([idOf(0), idOf(1)]);
    expect(page.nextCursor).not.toBeNull();
  });
});
