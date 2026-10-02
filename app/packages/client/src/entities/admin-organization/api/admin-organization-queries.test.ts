import { describe, expect, it } from "vitest";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { adminOrganizationSearchQuery, allAdminOrganizationsQuery } from "./admin-organization-queries.ts";

const signal = new AbortController().signal;
type Query = Record<string, string | number>;

const fakeCall = (asked: Query[]) =>
  ((_endpoint: unknown, input: { query: Query }) => {
    asked.push(input.query);
    const last = input.query["cursor"] === "next";
    return Promise.resolve({ data: [{ id: last ? "OrgB" : "OrgA" }], meta: { page: { cursor: last ? null : "next", hasMore: !last, limit: 100 } } });
  }) as unknown as CallEndpoint;

describe("admin organization queries", () => {
  it("reads every cursor page for the pickers", async () => {
    const asked: Query[] = [];
    const query = allAdminOrganizationsQuery(fakeCall(asked));
    const all = await query.queryFn?.({ signal, queryKey: query.queryKey, meta: undefined, client: undefined as never });
    expect(all?.items.map((organization) => organization.id)).toEqual(["OrgA", "OrgB"]);
    expect(all?.truncated).toBe(false);
    expect(asked).toEqual([{ limit: 100 }, { limit: 100, cursor: "next" }]);
  });

  it("sends the text and the status of a search, and neither when nothing is asked", async () => {
    const asked: Query[] = [];
    const call = fakeCall(asked);
    const context = { signal, meta: undefined, client: undefined as never, direction: "forward" as const };
    const filtered = adminOrganizationSearchQuery(call, { query: "acme", status: "suspended" });
    await filtered.queryFn?.({ ...context, queryKey: filtered.queryKey, pageParam: undefined });
    const plain = adminOrganizationSearchQuery(call, {});
    await plain.queryFn?.({ ...context, queryKey: plain.queryKey, pageParam: "next" });
    expect(asked).toEqual([{ limit: 20, query: "acme", status: "suspended" }, { limit: 20, cursor: "next" }]);
    expect(filtered.queryKey).not.toEqual(plain.queryKey);
  });
});
