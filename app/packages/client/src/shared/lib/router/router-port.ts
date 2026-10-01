import type { SupportedLocale } from "@core/i18n";
import type { ComponentProps, ComponentType } from "react";
import type { Route } from "./route-paths.ts";

export type RouterLinkProps = Omit<ComponentProps<"a">, "href"> & {
  to: Route;
  /** Replace the current history entry instead of pushing. */
  replace?: boolean;
};

/**
 * Navigation seen by shared views (decision 0012): views never import `next/*` or `@tanstack/*`.
 * Web adapter: next-intl `createNavigation` (locale-prefixed) + `useParams`/`useSearchParams`;
 * desktop adapter: TanStack Router; tests: `createMemoryRouter`. Hooks follow the rules of hooks.
 */
export type RouterPort = {
  /** Href for `<a>` and copy-link (the web adds `/{locale}`). */
  href: (route: Route) => string;
  /**
   * `samePage` (with `replace`): the route is another address of the page already on screen (the
   * chat once its conversation has an id). The address changes and the route params follow, but
   * the page is not built again, so its live state (a streaming answer) stays. An adapter whose
   * router keeps the page for such a change by itself navigates as usual.
   * `reload`: load the route as a new document (the web makes a full page load), so nothing the
   * previous screen held survives; used after the tab changed account (support access). An
   * adapter without documents navigates as usual.
   */
  navigate: (route: Route, options?: { replace?: boolean; samePage?: boolean; reload?: boolean }) => void;
  Link: ComponentType<RouterLinkProps>;
  /** Params of the current route (`organizationId`, `projectId`, `section`, …). */
  useRouteParams: () => Readonly<Record<string, string | undefined>>;
  useSearchParam: (name: string) => string | null;
  /** The whole query string without `?` ("" when empty): pages that keep several filters in the URL. */
  useSearch: () => string;
  /** Current path without the locale prefix, e.g. `/o/a/p/b`. */
  useLocationPath: () => string;
  /**
   * Shows the current page in another UI language (SP2 spec §5): the web writes the `NEXT_LOCALE`
   * cookie and navigates to the same path under `/{locale}`; the desktop re-renders its intl
   * provider. Callers save the preference first (`PATCH /v1/me`).
   */
  switchLocale: (locale: SupportedLocale) => void;
};
