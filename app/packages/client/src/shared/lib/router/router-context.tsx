"use client";

import { createContext, type ReactNode, use } from "react";
import type { RouterLinkProps, RouterPort } from "./router-port.ts";

const RouterContext = createContext<RouterPort | null>(null);

/** Provides the host's router adapter to every shared view (app-shell mounts it). */
export function RouterProvider({ router, children }: { router: RouterPort; children: ReactNode }) {
  return <RouterContext value={router}>{children}</RouterContext>;
}

/**
 * The router port of the host.
 * @throws {Error} outside `RouterProvider` (a composition bug).
 */
export const useRouter = (): RouterPort => {
  const router = use(RouterContext);
  if (router === null) throw new Error("useRouter must be used inside RouterProvider");
  return router;
};

/** `<a>` to a route through the host adapter (client-side navigation, locale on web). */
export function RouteLink(props: RouterLinkProps) {
  const { Link } = useRouter();
  return <Link {...props} />;
}
