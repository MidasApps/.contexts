import { describe, expect, it } from "vitest";
import { LIVE_LIST_POLL_MS, pollWhileAnyLive, pollWhilePageLive } from "./live-list-polling.ts";

type Row = { readonly status: string };
const isLive = (row: Row): boolean => row.status === "running";
const pageOf = (statuses: readonly string[]) => ({ data: statuses.map((status) => ({ status })), meta: { page: { cursor: null, hasMore: false, limit: 20 } } });

describe("pollWhileAnyLive", () => {
  it("polls while a row of any loaded page is live, and stops once all settled", () => {
    const poll = pollWhileAnyLive(isLive);
    expect(poll({ pages: [pageOf(["success"]), pageOf(["running"])], pageParams: [undefined, "c1"] })).toBe(LIVE_LIST_POLL_MS);
    expect(poll({ pages: [pageOf(["success", "failed"])], pageParams: [undefined] })).toBe(false);
    expect(poll(undefined)).toBe(false);
  });
});

describe("pollWhilePageLive", () => {
  it("polls a numbered page while one of its rows is live", () => {
    const poll = pollWhilePageLive(isLive);
    expect(poll({ data: [{ status: "running" }] })).toBe(LIVE_LIST_POLL_MS);
    expect(poll({ data: [{ status: "completed" }] })).toBe(false);
    expect(poll(undefined)).toBe(false);
  });
});
