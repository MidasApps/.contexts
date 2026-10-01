import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCursorPages, type CursorListState } from "./use-cursor-pages.ts";

const list = (data: number[], hasNextPage: boolean, fetchNextPage = vi.fn(() => Promise.resolve())): CursorListState<number> => ({ data, hasNextPage, isFetchingNextPage: false, fetchNextPage });

describe("useCursorPages", () => {
  it("has no pagination while everything fits one page", () => {
    const { result } = renderHook(() => useCursorPages(list([1, 2], false), 2));
    expect(result.current.rows).toEqual([1, 2]);
    expect(result.current.pagination).toBeUndefined();
  });

  it("fetches the next cursor only when it is not loaded, and goes back without refetching", async () => {
    const fetchNextPage = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(({ state }) => useCursorPages(state, 2, "Páginas"), { initialProps: { state: list([1, 2], true, fetchNextPage) } });
    expect(result.current.pagination).toMatchObject({ hasPrevious: false, hasNext: true, label: "Páginas" });
    await act(async () => result.current.pagination?.onNext());
    expect(fetchNextPage).toHaveBeenCalledOnce();
    rerender({ state: list([1, 2, 3], false, fetchNextPage) });
    expect(result.current.rows).toEqual([3]);
    act(() => result.current.pagination?.onPrevious());
    expect(result.current.rows).toEqual([1, 2]);
    await act(async () => result.current.pagination?.onNext());
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("clamps the page when rows disappear", async () => {
    const { result, rerender } = renderHook(({ state }) => useCursorPages(state, 2), { initialProps: { state: list([1, 2, 3], false) } });
    await act(async () => result.current.pagination?.onNext());
    rerender({ state: list([1, 2], false) });
    expect(result.current.rows).toEqual([1, 2]);
  });
});
