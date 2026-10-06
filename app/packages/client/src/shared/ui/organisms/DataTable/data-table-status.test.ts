import { describe, expect, it, vi } from "vitest";
import { type DataTableQuery, dataTableStatusOf } from "./data-table-status.ts";

const query = (overrides: Partial<DataTableQuery>): DataTableQuery => ({
  isPending: false,
  isError: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
});

describe("dataTableStatusOf", () => {
  it("is loading while the first page is pending", () => {
    expect(dataTableStatusOf(query({ isPending: true, isFetching: true }))).toEqual({ kind: "loading" });
  });

  it("carries the error, a retry that refetches and whether that retry is in flight", () => {
    const error = new Error("boom");
    const failed = query({ isError: true, error, isFetching: true });
    const status = dataTableStatusOf(failed);
    expect(status).toMatchObject({ kind: "error", error, retrying: true });
    if (status.kind === "error") status.onRetry?.();
    expect(failed.refetch).toHaveBeenCalledTimes(1);
  });

  it("is ready once data arrived", () => {
    expect(dataTableStatusOf(query({}))).toEqual({ kind: "ready" });
  });
});
