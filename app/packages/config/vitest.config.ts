import { defineCoreVitestConfig } from "./vitest/preset.ts";

// Config default export is required by Vitest's config loader.
export default defineCoreVitestConfig({
  test: { include: ["eslint/**/*.test.ts"] },
});
