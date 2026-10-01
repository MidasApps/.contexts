import { describe, expect, it } from "vitest";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { adminUserLabel } from "../lib/admin-user-label.ts";
import { adminUsersByIdQuery, distinctSortedIds } from "./admin-user-queries.ts";

const signal = new AbortController().signal;

describe("admin user lookups", () => {
  it("keeps each id once, sorted, without empty ones", () => {
    expect(distinctSortedIds(["b", null, "a", "b", undefined, ""])).toEqual(["a", "b"]);
  });

  it("reads 150 ids in two calls of at most 100", async () => {
    const asked: string[][] = [];
    const callEndpoint = ((_endpoint: unknown, input: { query: { ids: string } }) => {
      const ids = input.query.ids.split(",");
      asked.push(ids);
      return Promise.resolve({ data: ids.map((id) => ({ id, email: null, displayName: `Name ${id}`, status: "active", createdAt: null })), meta: { page: { cursor: null, hasMore: false, limit: 100 } } });
    }) as unknown as CallEndpoint;
    const ids = Array.from({ length: 150 }, (_, index) => `u${String(index).padStart(3, "0")}`);
    const query = adminUsersByIdQuery(callEndpoint, ids);
    const users = await query.queryFn?.({ signal, queryKey: query.queryKey, meta: undefined, client: undefined as never });
    expect(asked.map((chunk) => chunk.length)).toEqual([100, 50]);
    expect(users).toHaveLength(150);
  });

  it("labels a user by name, then email, then id", () => {
    expect(adminUserLabel({ id: "u1", email: "ana@example.com", displayName: " Ana " })).toBe("Ana");
    expect(adminUserLabel({ id: "u1", email: "ana@example.com", displayName: "" })).toBe("ana@example.com");
    expect(adminUserLabel({ id: "u1", email: null, displayName: " " })).toBe("u1");
  });
});
