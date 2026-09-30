import { coreVitestConfig } from "@core/config/vitest";
import { defineConfig } from "vitest/config";

/**
 * - `*.test.ts` (unit): no external process, `AI_MODE=fake`; `pnpm test`.
 * - `*.emulator.test.ts`: the Firebase Emulator Suite; root `pnpm test:emulators`.
 */
const EMULATOR_TESTS = "src/**/*.emulator.test.ts";

// Projects copy the preset instead of `extends: true`: mergeConfig concatenates
// arrays, so the preset's `include` would leak unit tests into every project.
const { coverage, include = [], exclude = [], ...presetDefaults } = coreVitestConfig.test ?? {};

const defineProject = (args: { name: string; include: string[]; exclude?: string[] }) => ({
  test: { ...presetDefaults, name: args.name, include: args.include, exclude: [...exclude, ...(args.exclude ?? [])], env: { AI_MODE: "fake" } },
});

// Config default export is required by Vitest's config loader.
export default defineConfig({
  test: {
    ...(coverage ? { coverage } : {}),
    projects: [
      defineProject({ name: "unit", include, exclude: [EMULATOR_TESTS] }),
      defineProject({ name: "emulators", include: [EMULATOR_TESTS] }),
    ],
  },
});
