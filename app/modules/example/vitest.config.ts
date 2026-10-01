import { coreVitestConfig } from "@core/config/vitest";
import { defineConfig } from "vitest/config";

const EMULATOR_TESTS = "src/**/*.emulator.test.ts";

// Projects copy the preset instead of `extends: true`: mergeConfig concatenates arrays, so the
// preset's `include` would leak unit tests into the emulator project.
const { coverage, include = [], exclude = [], ...presetDefaults } = coreVitestConfig.test ?? {};

// Config default export is required by Vitest's config loader.
export default defineConfig({
  test: {
    ...(coverage ? { coverage } : {}),
    projects: [
      // jsdom because the page tests render inside the real client composition (Testing Library +
      // axe-core); server and agent tests opt into node with `// @vitest-environment node`.
      { test: { ...presetDefaults, name: "unit", include, exclude: [...exclude, EMULATOR_TESTS], environment: "jsdom", setupFiles: ["./src/testing/setup.ts"] } },
      // `*.emulator.test.ts` needs the Firebase Emulator Suite (root `pnpm test:emulators`).
      { test: { ...presetDefaults, name: "emulators", include: [EMULATOR_TESTS], exclude, fileParallelism: false } },
    ],
  },
});
