import { coreVitestConfig, EMULATOR_PROJECT_DEFAULTS } from "@core/config/vitest";
import { defineConfig } from "vitest/config";

const EMULATOR_TESTS = "src/**/*.emulator.test.ts";

// Projects copy the preset instead of `extends: true`: mergeConfig concatenates arrays, so the
// preset's `include` would leak unit tests into the emulator project.
const { coverage, include = [], exclude = [], ...presetDefaults } = coreVitestConfig.test ?? {};

// Config default export is required by Vitest's config loader.
export default defineConfig({
  test: {
    ...(coverage ? { coverage } : {}),
    // Pool options are root-only with projects. Half the cores, like `@core/client`: jsdom + axe
    // renders are CPU-bound and starve each other when turbo runs this suite next to the client's.
    maxWorkers: "50%",
    projects: [
      // jsdom because the page tests render inside the real client composition (Testing Library +
      // axe-core); server and agent tests opt into node with `// @vitest-environment node`.
      // The 5 s default timed out under that load; `@core/client` uses 15 s too.
      { test: { ...presetDefaults, name: "unit", include, exclude: [...exclude, EMULATOR_TESTS], environment: "jsdom", setupFiles: ["./src/testing/setup.ts"], testTimeout: 15_000 } },
      // `*.emulator.test.ts` needs the Firebase Emulator Suite (root `pnpm test:emulators`).
      { test: { ...presetDefaults, ...EMULATOR_PROJECT_DEFAULTS, name: "emulators", include: [EMULATOR_TESTS], exclude } },
    ],
  },
});
