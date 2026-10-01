import { createReactConfig } from "@core/config/eslint";

// ESLint's flat config loader requires a default export.
// routeTree.gen.ts is written by the TanStack Router Vite plugin.
export default [
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ["src/routeTree.gen.ts", "src-tauri/**"] },
];
