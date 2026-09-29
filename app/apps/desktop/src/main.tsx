import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHealthClient } from "@/api/health-client.ts";
import { env } from "@/config/env.ts";
import { routeTree } from "@/routeTree.gen.ts";
import "@/styles.css";

// Composition root: the only place that wires real I/O (global fetch) into
// the router context that loaders read.
const router = createRouter({
  routeTree,
  context: { healthClient: createHealthClient({ baseUrl: env.VITE_API_URL, fetch: globalThis.fetch.bind(globalThis) }) },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html is missing #root");

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
