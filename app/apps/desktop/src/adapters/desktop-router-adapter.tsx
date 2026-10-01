import type { ReportError } from "@core/client/app-shell";
import { parseRoute, routeHref, type Route, type RouterLinkProps, type RouterPort } from "@core/client/shared/lib/router";
import type { SupportedLocale } from "@core/i18n";
import { useRouterState } from "@tanstack/react-router";
import type { MouseEvent } from "react";

/** What the adapter needs from the TanStack router: navigation by href (the route map builds it). */
export type NavigateByHref = (args: { href: string; replace: boolean }) => Promise<void>;

export type DesktopRouterAdapterArgs = {
  readonly navigate: NavigateByHref;
  /** Re-renders the intl provider in another language (the desktop has no locale segment). */
  readonly switchLocale: (locale: SupportedLocale) => void;
  readonly reportError: ReportError;
};

const paramsOf = (route: Route | null): Record<string, string | undefined> => {
  if (route === null) return {};
  return Object.fromEntries(Object.entries(route).filter((entry): entry is [string, string] => entry[0] !== "id" && typeof entry[1] === "string"));
};

const isPlainClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const useHref = (): string => useRouterState({ select: (state) => state.location.href });

/**
 * Router port over TanStack Router (decision 0012): hrefs and params come from the shared route
 * map (`routeHref`/`parseRoute`), so views see the same params (`organizationId`, `rest`, …) as on
 * web and in tests; TanStack only owns history and matching. Hooks must run under its provider.
 */
export const createDesktopRouterAdapter = ({ navigate: navigateByHref, switchLocale, reportError }: DesktopRouterAdapterArgs): RouterPort => {
  const navigate: RouterPort["navigate"] = (route, options) => {
    navigateByHref({ href: routeHref(route), replace: options?.replace === true }).catch((error: unknown) => reportError(error, { operation: "navigate" }));
  };
  function Link({ to, replace, onClick, target, children, ...props }: RouterLinkProps) {
    return (
      <a
        href={routeHref(to)}
        target={target}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || !isPlainClick(event) || (target !== undefined && target !== "_self")) return;
          event.preventDefault();
          navigate(to, { replace: replace === true });
        }}
        {...props}
      >
        {children}
      </a>
    );
  }
  return {
    href: routeHref,
    navigate,
    Link,
    useRouteParams: () => paramsOf(parseRoute(useHref())),
    useSearchParam: (name) => new URLSearchParams(useRouterState({ select: (state) => state.location.searchStr })).get(name),
    useLocationPath: () => useRouterState({ select: (state) => state.location.pathname }),
    switchLocale,
  };
};
