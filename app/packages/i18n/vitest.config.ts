import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader.
export default defineCoreVitestConfig({
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
});
