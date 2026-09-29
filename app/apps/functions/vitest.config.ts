import { coreVitestConfig } from "@core/config/vitest";

/**
 * Same split as `@core/services` (file suffix = what the test needs):
 * - `*.test.ts` (unit): pure; `pnpm test`.
 * - `*.emulator.test.ts`: calls the built functions served by the Functions
 *   emulator; run inside `firebase emulators:exec --only functions`.
 */
const EMULATOR_TESTS = "src/**/*.emulator.test.ts";

// Projects copy the preset instead of `extends: true`: mergeConfig concatenates
// arrays, so the preset's `include` would leak unit tests into every project.
const { coverage, include = [], exclude = [], ...presetDefaults } = coreVitestConfig.test ?? {};

const defineProject = (args: { name: string; include: string[]; exclude?: string[]; testTimeout?: number }) => ({
  test: {
    ...presetDefaults,
    ...(args.testTimeout === undefined ? {} : { testTimeout: args.testTimeout }),
    name: args.name,
    include: args.include,
    exclude: [...exclude, "**/lib/**", ...(args.exclude ?? [])],
  },
});

// Config default export is required by Vitest's config loader. A plain object, not this package's
// defineConfig: the projects carry @core/config's Vitest types (resolved against @types/node 26)
// while this package resolves Vitest against @types/node 24, and the two do not unify. Nor
// defineCoreVitestConfig: its root `include` would leak unit tests into the emulators project.
export default {
  test: {
    ...(coverage ? { coverage } : {}),
    projects: [
      defineProject({ name: "unit", include, exclude: [EMULATOR_TESTS] }),
      // The first request boots the emulator worker, which can take seconds on a cold machine.
      defineProject({ name: "emulators", include: [EMULATOR_TESTS], testTimeout: 30_000 }),
    ],
  },
};
