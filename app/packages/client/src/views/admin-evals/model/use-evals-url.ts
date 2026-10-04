"use client";

import { useRouter } from "#/shared/lib/router/router-context.tsx";

export const EVAL_TABS = ["experiments", "datasets"] as const;
export type EvalTab = (typeof EVAL_TABS)[number];

export type EvalsUrl = {
  readonly tab: EvalTab;
  /** 1-based page of the experiments list. */
  readonly page: number;
  /** Experiments chosen for the comparison (A, then B), from `?a=&b=`. */
  readonly compare: readonly string[];
  readonly setTab: (tab: EvalTab) => void;
  /** The comparison stays: a chosen experiment of another page is read by id (decision 0049). */
  readonly setPage: (page: number) => void;
  /** Adds the experiment to the comparison or removes it; a third choice replaces B. */
  readonly toggleCompare: (experimentId: string) => void;
  readonly clearCompare: () => void;
};

const isTab = (value: string | null): value is EvalTab => (EVAL_TABS as readonly string[]).includes(value ?? "");

/**
 * URL state of `/admin/evals` (decision 0042 §3): the tab, the experiments page and the two
 * experiments under comparison, so a comparison is a link staff can share. Unlike a filter, the
 * comparison survives paging (its experiments are read by id) and goes with the tab, hence the
 * dedicated hook.
 */
export const useEvalsUrl = (): EvalsUrl => {
  const router = useRouter();
  const rest = router.useRouteParams()["rest"] ?? "";
  const params = new URLSearchParams(router.useSearch());
  const parsedPage = Number.parseInt(params.get("page") ?? "1", 10);
  const compare = [params.get("a"), params.get("b")].filter((id): id is string => id !== null && id !== "");
  const write = (change: (next: URLSearchParams) => void): void => {
    const next = new URLSearchParams(params);
    change(next);
    router.navigate({ id: "admin", rest, search: Object.fromEntries(next) }, { replace: true });
  };
  const writeCompare = (next: URLSearchParams, ids: readonly string[]): void => {
    next.delete("a");
    next.delete("b");
    if (ids[0] !== undefined) next.set("a", ids[0]);
    if (ids[1] !== undefined) next.set("b", ids[1]);
  };
  const rawTab = params.get("tab");
  return {
    tab: isTab(rawTab) ? rawTab : "experiments",
    page: Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1,
    compare,
    setTab: (tab) =>
      write((next) => {
        writeCompare(next, []);
        next.delete("page");
        if (tab === "experiments") next.delete("tab");
        else next.set("tab", tab);
      }),
    setPage: (page) =>
      write((next) => {
        if (page <= 1) next.delete("page");
        else next.set("page", String(page));
      }),
    toggleCompare: (experimentId) =>
      write((next) =>
        writeCompare(
          next,
          compare.includes(experimentId)
            ? compare.filter((id) => id !== experimentId)
            : [compare[0], experimentId].filter((id): id is string => id !== undefined),
        ),
      ),
    clearCompare: () => write((next) => writeCompare(next, [])),
  };
};
