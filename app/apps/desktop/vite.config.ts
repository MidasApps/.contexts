import path from "node:path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Fixed dev port: `src-tauri/tauri.conf.json` `build.devUrl` points here. */
const DEV_PORT = 1420;

// Vite's config loader requires a default export.
export default defineConfig({
  // The router plugin must run before the React plugin (TanStack Router docs).
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react()],
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
});
