import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader. The app's Vite
// plugins (router generator, React) stay out of unit tests on purpose.
// mergeConfig concatenates arrays: this adds the build scripts to the preset's src/** include.
export default defineCoreVitestConfig({ test: { include: ["scripts/**/*.test.ts"] } });
