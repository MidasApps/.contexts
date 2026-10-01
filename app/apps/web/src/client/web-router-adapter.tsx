"use client";

import { parseRoute, routeHref, type Route, type RouterLinkProps, type RouterPort } from "@core/client/shared/lib/router";
import type { SupportedLocale } from "@core/i18n";
import { usePathname as useNextPathname, useSearchParams } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { Link as LocaleLink } from "@/i18n/navigation";

/** Client-side navigation by unprefixed href (next-intl's `useRouter`, which adds the locale). */
export type WebNavigator = {
  readonly push: (href: string) => void;
  readonly replace: (href: string) => void;
  /** Same href in another locale (next-intl updates the `NEXT_LOCALE` cookie). */
  readonly replaceInLocale: (href: string, locale: SupportedLocale) => void;
};

/** The Next/next-intl hooks and link the adapter reads; tests pass fakes. */
export type WebRouterHooks = {
  /** Current pathname without the locale prefix (next-intl `usePathname`). */
  readonly usePathname: () => string;
  readonly useSearch: () => string;
  readonly Link: ComponentType<{ href: string; replace?: boolean | undefined; prefetch?: boolean | undefined; children?: ReactNode } & Omit<RouterLinkProps, "to" | "replace">>;
};

export type WebRouterAdapter = RouterPort & {
  /** Called by `WebRouterBridge` once next-intl's router exists (and with `null` on unmount). */
  readonly attach: (navigator: WebNavigator | null) => void;
};

export type WebRouterAdapterArgs = {
  readonly locale: SupportedLocale;
  /** Full-page navigation, used before the bridge attaches (never in practice after hydration). */
  readonly assign: (href: string) => void;
  readonly hooks?: WebRouterHooks | undefined;
  /** Writes the address bar without a navigation; tests pass a fake. */
  readonly replaceAddress?: ((href: string) => void) | undefined;
};

// The App Router keeps `usePathname`/`useSearchParams` in sync with a native `replaceState` and
// leaves the page tree alone. `router.replace` to another value of a dynamic segment would build
// a new page instance instead (and drop a streaming chat thread).
const replaceBrowserAddress = (href: string): void => globalThis.history.replaceState(null, "", href);

/** `/pt-BR/o/a` → `/o/a`, `/pt-BR` → `/` (every page path carries the locale, `localePrefix: "always"`). */
export const stripLocalePrefix = (pathname: string): string => pathname.replace(/^\/[^/]+/, "") || "/";

// next/navigation's pathname, not next-intl's: the shell reads the route node while it builds the
// intl provider, and next-intl's hook needs that provider (it reads the locale from it).
const NEXT_HOOKS: WebRouterHooks = {
  usePathname: () => stripLocalePrefix(useNextPathname()),
  useSearch: () => useSearchParams().toString(),
  Link: LocaleLink,
};

const paramsOf = (route: Route | null): Record<string, string | undefined> => {
  if (route === null) return {};
  return Object.fromEntries(Object.entries(route).filter((entry): entry is [string, string] => entry[0] !== "id" && typeof entry[1] === "string"));
};

const withSearch = (path: string, search: string): string => (search === "" ? path : `${path}?${search}`);

/**
 * Router port over next-intl (decision 0012 §2): hrefs and params come from the shared route map
 * (`routeHref`/`parseRoute`) so views see the same params on web, desktop and tests; the web only
 * adds `/{locale}`. Navigation goes through next-intl's router once `WebRouterBridge` attaches it.
 */
export const createWebRouterAdapter = ({ locale, assign, hooks = NEXT_HOOKS, replaceAddress = replaceBrowserAddress }: WebRouterAdapterArgs): WebRouterAdapter => {
  let navigator: WebNavigator | null = null;
  const localized = (href: string, target: SupportedLocale = locale): string => `/${target}${href === "/" ? "" : href}`;
  const navigate: RouterPort["navigate"] = (route, options) => {
    const href = routeHref(route);
    if (navigator === null || options?.reload === true) return assign(localized(href));
    if (options?.replace === true && options.samePage === true) return replaceAddress(localized(href));
    if (options?.replace === true) navigator.replace(href);
    else navigator.push(href);
  };
  function Link({ to, replace, ...props }: RouterLinkProps) {
    // `/admin` is gated per request by the staff session of that moment (and 404s otherwise): a
    // prefetch fired while a session is being exchanged or switched (sign-in, support access)
    // answered 404 into the console and the client cache. Its pages are dynamic anyway.
    const prefetch = to.id === "admin" ? false : undefined;
    return <hooks.Link href={routeHref(to)} replace={replace === true} prefetch={prefetch} {...props} />;
  }
  const useCurrentHref = (): string => withSearch(hooks.usePathname(), hooks.useSearch());
  return {
    href: (route) => localized(routeHref(route)),
    navigate,
    Link,
    useRouteParams: () => paramsOf(parseRoute(useCurrentHref())),
    useSearchParam: (name) => new URLSearchParams(hooks.useSearch()).get(name),
    useSearch: () => hooks.useSearch(),
    useLocationPath: () => hooks.usePathname(),
    // Reads the current location at call time (an event handler, not a render).
    switchLocale: (target) => {
      const current = withSearch(stripLocalePrefix(globalThis.location.pathname), globalThis.location.search.slice(1));
      if (navigator === null) return assign(localized(current, target));
      navigator.replaceInLocale(current, target);
    },
    attach: (next) => {
      navigator = next;
    },
  };
};
