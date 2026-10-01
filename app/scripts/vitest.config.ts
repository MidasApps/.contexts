import { coreVitestConfig, EMULATOR_PROJECT_DEFAULTS } from "@core/config/vitest";
import { defineConfig } from "vitest/config";

/**
 * Same split as `@core/services` (file suffix = what the test needs):
 * - `*.test.ts` (unit): no external service; `pnpm test`.
 * - `*.emulator.test.ts`: needs the Auth Emulator; run inside
 *   `firebase emulators:exec` via the root `pnpm test:emulators`.
 */
const EMULATOR_TESTS = "src/**/*.emulator.test.ts";

// Projects copy the preset instead of `extends: true`: mergeConfig concatenates
// arrays, so the preset's `include` would leak unit tests into every project.
const { coverage, include = [], exclude = [], ...presetDefaults } = coreVitestConfig.test ?? {};

const defineProject = (args: { name: string; include: string[]; exclude?: string[]; overrides?: typeof EMULATOR_PROJECT_DEFAULTS }) => ({
  test: {
    ...presetDefaults,
    ...args.overrides,
    name: args.name,
    include: args.include,
    exclude: [...exclude, ...(args.exclude ?? [])],
  },
});

// Config default export is required by Vitest's config loader.
export default defineConfig({
  test: {
    ...(coverage ? { coverage } : {}),
    projects: [
      defineProject({ name: "unit", include, exclude: [EMULATOR_TESTS] }),
      defineProject({ name: "emulators", include: [EMULATOR_TESTS], overrides: EMULATOR_PROJECT_DEFAULTS }),
    ],
  },
});
