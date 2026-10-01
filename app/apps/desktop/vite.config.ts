import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { loadDesktopBuildEnv } from "./scripts/load-desktop-build-env.ts";

/** Fixed dev port: `src-tauri/tauri.conf.json` `build.devUrl` points here. */
const DEV_PORT = 1420;

// Vite's config loader requires a default export.
export default defineConfig(({ mode }) => {
  // Fail closed: dev and build refuse to start with a missing or invalid
  // VITE_API_URL instead of bundling an app that cannot reach its API.
  loadDesktopBuildEnv({ mode, envDir: import.meta.dirname });
  return {
  // The router plugin must run before the React plugin (TanStack Router docs); Tailwind 4 compiles
  // src/styles.css (the shared @core/client tokens) through its Vite plugin.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  // Same alias as tsconfig `paths` (rule development: no ../../ imports).
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Keep Rust compiler output visible when `tauri dev` runs Vite.
  clearScreen: false,
  // Only VITE_* reaches the bundle; everything in it is public (secrets.md §5.3).
  envPrefix: ["VITE_"],
  server: {
    port: DEV_PORT,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  };
});
