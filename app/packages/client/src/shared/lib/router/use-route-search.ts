"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "./router-context.tsx";
import { SETTINGS_SECTIONS, type Route, type SettingsSection } from "./route-paths.ts";

export type RouteSearch<K extends string> = {
  /** Current value of each key; `undefined` when absent from the URL. */
  readonly values: Readonly<Record<K, string | undefined>>;
  /** 1-based page of a numbered list (`?page=`), 1 when absent or invalid. */
  readonly page: number;
  /**
   * Writes values into the URL (replace, so "back" leaves the page; `samePage`, so the page is not
   * built again). `undefined` or "" removes a key. Changing a value returns to the first page.
   */
  readonly set: (patch: Partial<Record<K, string | undefined>>) => void;
  readonly setPage: (page: number) => void;
};

const PAGE = "page";

/**
 * Filters, tabs and paging of a page kept in the query string, so a reload or a shared link
 * keeps them. `toRoute` builds the current page's route with a new search; every other query
 * parameter of the page is preserved.
 */
export const useRouteSearch = <K extends string>(keys: readonly K[], toRoute: (search: Record<string, string>) => Route): RouteSearch<K> => {
  const router = useRouter();
  const search = router.useSearch();
  const params = new URLSearchParams(search);
  // The query written last, until the URL shows it: two writes before a re-render (two date fields
  // changed in a row) must build on each other, not both on the URL of the last render.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [search]);
  const base = (): URLSearchParams => new URLSearchParams(pending.current ?? search);
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? undefined])) as Record<K, string | undefined>;
  const parsedPage = Number.parseInt(params.get(PAGE) ?? "1", 10);
  // Same page, another address: the web writes the address bar instead of navigating, so a tab or
  // filter changes at once. A navigation waited for the server, and a second tab clicked meanwhile
  // was ignored (the first was still selected) and then lost to the first one.
  const write = (next: URLSearchParams): void => {
    pending.current = next.toString();
    router.navigate(toRoute(Object.fromEntries(next)), { replace: true, samePage: true });
  };
  return {
    values,
    page: Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1,
    set: (patch) => {
      const next = base();
      for (const [key, value] of Object.entries<string | undefined>(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete(PAGE);
      write(next);
    },
    setPage: (page) => {
      const next = base();
      if (page <= 1) next.delete(PAGE);
      else next.set(PAGE, String(page));
      write(next);
    },
  };
};

const isSettingsSection = (value: string | undefined): value is SettingsSection => (SETTINGS_SECTIONS as readonly (string | undefined)[]).includes(value);

/**
 * `useRouteSearch` for a settings section (`/o/:organizationId/settings/:section`): its tabs,
 * filters and page survive a reload, a shared link and the browser's back from a detail page.
 * @example const search = useSettingsSearch(["tab"]); search.set({ tab: "history" });
 */
export const useSettingsSearch = <K extends string>(keys: readonly K[]): RouteSearch<K> => {
  const params = useRouter().useRouteParams();
  const organizationId = params["organizationId"] ?? "";
  const section = params["section"];
  const rest = params["rest"];
  return useRouteSearch(keys, (search) => {
    if (!isSettingsSection(section)) throw new Error(`useSettingsSearch outside a settings section: ${String(section)}`);
    return { id: "settings", organizationId, section, ...(rest === undefined ? {} : { rest }), search };
  });
};

/** A search value that must be one of `options`, else `fallback` (hand-edited or stale links). */
export const searchOption = <T extends string>(value: string | undefined, options: readonly T[], fallback: T): T =>
  value !== undefined && (options as readonly string[]).includes(value) ? (value as T) : fallback;

/**
 * The current query string as a route search: links between a settings list and its detail
 * pages carry it, so "back" from a run, a trace or a request returns to the same tab, filters and
 * page.
 */
export const useCarriedSearch = (): Readonly<Record<string, string>> => Object.fromEntries(new URLSearchParams(useRouter().useSearch()));
