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
  navigate: (route: Route, options?: { replace?: boolean }) => void;
  Link: ComponentType<RouterLinkProps>;
  /** Params of the current route (`organizationId`, `projectId`, `section`, …). */
  useRouteParams: () => Readonly<Record<string, string | undefined>>;
  useSearchParam: (name: string) => string | null;
  /** Current path without the locale prefix, e.g. `/o/a/p/b`. */
  useLocationPath: () => string;
  /**
   * Shows the current page in another UI language (SP2 spec §5): the web writes the `NEXT_LOCALE`
   * cookie and navigates to the same path under `/{locale}`; the desktop re-renders its intl
   * provider. Callers save the preference first (`PATCH /v1/me`).
   */
  switchLocale: (locale: SupportedLocale) => void;
};
