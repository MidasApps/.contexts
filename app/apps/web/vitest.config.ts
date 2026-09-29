import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader.
// mergeConfig concatenates arrays: this adds the dev scripts to the preset's src/** include.
export default defineCoreVitestConfig({ test: { include: ["scripts/**/*.test.ts"] } });
