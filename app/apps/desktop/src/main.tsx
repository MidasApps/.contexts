import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InvalidDesktopEnvError } from "@/config/desktop-env.schema.ts";
import { ConfigErrorScreen } from "@/ConfigErrorScreen.tsx";
import "@/styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html is missing #root");
const root = createRoot(rootElement);

// vite.config.ts already refuses to build with an invalid env; this guard covers
// a bundle whose env was bypassed, showing names instead of a blank window.
// `@/env.ts` parses at import time, hence the dynamic import inside try.
try {
  const { env } = await import("@/env.ts");
  const { createAppRouter } = await import("@/router.ts");
  root.render(
    <StrictMode>
      <RouterProvider router={createAppRouter(env)} />
    </StrictMode>,
  );
} catch (error: unknown) {
  if (!(error instanceof InvalidDesktopEnvError)) throw error;
  root.render(<ConfigErrorScreen fields={error.fields} />);
}
