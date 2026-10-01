"use client";

import type { SupportedLocale } from "@core/i18n";
import { useSyncExternalStore, type MouseEvent } from "react";
import { parseRoute } from "./parse-route.ts";
import { routeHref, type Route } from "./route-paths.ts";
import type { RouterLinkProps, RouterPort } from "./router-port.ts";

export type MemoryRouter = RouterPort & {
  /** Current href (path + search + hash). */
  current: () => string;
  /** Every href visited, oldest first (replace overwrites the last entry). */
  history: () => readonly string[];
  /** Every `switchLocale` call, oldest first. */
  localeSwitches: () => readonly SupportedLocale[];
};

const paramsOf = (route: Route | null): Record<string, string | undefined> => {
  if (route === null) return {};
  const { id: _id, ...params } = route;
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

const isPlainClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * In-memory router for tests (and stories): same port as the host adapters, history kept in an
 * array, hooks re-render on navigation.
 */
export const createMemoryRouter = (initialHref = "/"): MemoryRouter => {
  const entries = [initialHref];
  const listeners = new Set<() => void>();
  const locales: SupportedLocale[] = [];
  const current = (): string => entries.at(-1) ?? "/";
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const useHref = (): string => useSyncExternalStore(subscribe, current, current);
  const navigate: RouterPort["navigate"] = (route, options) => {
    if (options?.replace === true) entries.pop();
    entries.push(routeHref(route));
    listeners.forEach((listener) => listener());
  };
  function Link({ to, replace, onClick, ...props }: RouterLinkProps) {
    return (
      <a
        href={routeHref(to)}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || !isPlainClick(event)) return;
          event.preventDefault();
          navigate(to, { replace: replace === true });
        }}
        {...props}
      />
    );
  }
  return {
    href: routeHref,
    navigate,
    Link,
    useRouteParams: () => paramsOf(parseRoute(useHref())),
    useSearchParam: (name) => new URL(useHref(), "http://memory.invalid").searchParams.get(name),
    useSearch: () => new URL(useHref(), "http://memory.invalid").searchParams.toString(),
    useLocationPath: () => new URL(useHref(), "http://memory.invalid").pathname,
    switchLocale: (locale) => void locales.push(locale),
    current,
    history: () => [...entries],
    localeSwitches: () => [...locales],
  };
};
