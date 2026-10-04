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
    await act(() => Promise.resolve(result.current.pagination?.onNext()));
    expect(fetchNextPage).toHaveBeenCalledOnce();
    rerender({ state: list([1, 2, 3], false, fetchNextPage) });
    expect(result.current.rows).toEqual([3]);
    act(() => result.current.pagination?.onPrevious());
    expect(result.current.rows).toEqual([1, 2]);
    await act(() => Promise.resolve(result.current.pagination?.onNext()));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("keeps the page where the caller says (the URL) and loads the pages before a linked one", () => {
    const fetchNextPage = vi.fn(() => Promise.resolve());
    const setPage = vi.fn();
    const { result, rerender } = renderHook(({ state }) => useCursorPages(state, 2, undefined, { page: 3, setPage }), { initialProps: { state: list([1, 2], true, fetchNextPage) } });
    // Page 3 of a shared link: the cursors before it are fetched one at a time.
    expect(fetchNextPage).toHaveBeenCalledOnce();
    rerender({ state: list([1, 2, 3, 4], true, fetchNextPage) });
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    rerender({ state: list([1, 2, 3, 4, 5], false, fetchNextPage) });
    expect(result.current.rows).toEqual([5]);
    act(() => result.current.pagination?.onPrevious());
    expect(setPage).toHaveBeenCalledWith(2);
  });

  it("clamps the page when rows disappear", async () => {
    const { result, rerender } = renderHook(({ state }) => useCursorPages(state, 2), { initialProps: { state: list([1, 2, 3], false) } });
    await act(() => Promise.resolve(result.current.pagination?.onNext()));
    rerender({ state: list([1, 2], false) });
    expect(result.current.rows).toEqual([1, 2]);
  });
});
