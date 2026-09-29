import { createRouter } from "@tanstack/react-router";
import { createHealthClient } from "@/api/health-client.ts";
import type { DesktopEnv } from "@/config/desktop-env.schema.ts";
import { routeTree } from "@/routeTree.gen.ts";

/**
 * Builds the app router with its context: the only place that wires real I/O
 * (global fetch) into what loaders read.
 */
export const createAppRouter = (env: DesktopEnv) =>
  createRouter({
    routeTree,
    context: { healthClient: createHealthClient({ baseUrl: env.VITE_API_URL, fetch: globalThis.fetch.bind(globalThis) }) },
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
