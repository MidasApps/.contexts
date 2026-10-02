import { createReactConfig } from "@core/config/eslint";

// ESLint's flat config loader requires a default export.
// routeTree.gen.ts is written by the TanStack Router Vite plugin. public/ is served as is
// (zod-jitless.js is a classic script, tested by src/zod-jitless.test.ts).
export default [
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ["src/routeTree.gen.ts", "src-tauri/**", "public/**"] },
];
