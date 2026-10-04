import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { resolveDesktopLocale } from "@/adapters/desktop-locale.ts";
import { ConfigErrorScreen } from "@/ConfigErrorScreen.tsx";
import { InvalidDesktopEnvError } from "@/config/desktop-env.schema.ts";
import "@/styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html is missing #root");
const root = createRoot(rootElement);

/** Local storage, or `undefined` when the webview blocks it (reading the property can throw). */
const localStorageOrUndefined = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

// vite.config.ts already refuses to build with an invalid env; this guard covers
// a bundle whose env was bypassed, showing names instead of a blank window.
// `@/env.ts` parses at import time, hence the dynamic import inside try.
try {
  const { env } = await import("@/env.ts");
  const { createDesktopRuntime } = await import("@/app/create-desktop-runtime.ts");
  const { router } = createDesktopRuntime({ env, languages: navigator.languages, storage: localStorageOrUndefined() });
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
} catch (error: unknown) {
  if (!(error instanceof InvalidDesktopEnvError)) throw error;
  root.render(
    <ConfigErrorScreen
      fields={error.fields}
      locale={resolveDesktopLocale({ profileLocale: undefined, languages: navigator.languages })}
    />,
  );
}
