import path from "node:path";
import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader.
// mergeConfig concatenates arrays: this adds the dev scripts to the preset's src/** include.
// `@/` mirrors the tsconfig path alias. next-intl is inlined so Vite resolves its extensionless
// `next/server` imports (Node's ESM resolver refuses them: `next` has no exports map). Component
// tests opt into jsdom per file (`@vitest-environment jsdom`) and load the client test setup.
export default defineCoreVitestConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // tsconfig keeps `jsx: "preserve"` for Next; tests compile JSX with the automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["scripts/**/*.test.ts"],
    server: { deps: { inline: ["next-intl"] } },
  },
});
