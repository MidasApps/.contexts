import { createRouter, type RouterHistory } from "@tanstack/react-router";
import type { RouterContext } from "@/router-context.ts";
import { parsePlainSearch, stringifyPlainSearch } from "@/router-search.ts";
import { routeTree } from "@/routeTree.gen.ts";

/**
 * The TanStack router of the desktop user area (decision 0012): file routes mirror the shared route
 * map without a locale segment and without `/admin`. Search values stay raw strings.
 * @param args.history memory history in tests; browser history (the default) in the app.
 */
export const createAppRouter = (args: { app: RouterContext["app"]; history?: RouterHistory | undefined }) =>
  createRouter({
    routeTree,
    context: { app: args.app },
    parseSearch: parsePlainSearch,
    stringifySearch: stringifyPlainSearch,
    ...(args.history === undefined ? {} : { history: args.history }),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
