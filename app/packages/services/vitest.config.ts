import { coreVitestConfig } from "@core/config/vitest";
import { defineConfig } from "vitest/config";

/**
 * Tests are split by what they need to run, encoded in the file suffix:
 * - `*.test.ts` (unit): pure, no external process; `pnpm test`.
 * - `*.emulator.test.ts`: needs the Firebase Emulator Suite; run inside
 *   `firebase emulators:exec` via the root `pnpm test:emulators`.
 * - `*.postgres.test.ts`: needs the local Postgres container
 *   (`docker compose up -d --wait`); `pnpm test:postgres`.
 * Keeping them out of `unit` means `pnpm test` never waits on a missing service.
 */
const EMULATOR_TESTS = "src/**/*.emulator.test.ts";
const POSTGRES_TESTS = "src/**/*.postgres.test.ts";

// Projects copy the preset instead of `extends: true`: mergeConfig concatenates
// arrays, so the preset's `include` would leak unit tests into every project.
const { coverage, include = [], exclude = [], ...presetDefaults } = coreVitestConfig.test ?? {};

const defineProject = (args: { name: string; include: string[]; exclude?: string[]; fileParallelism?: boolean }) => ({
  test: {
    ...presetDefaults,
    name: args.name,
    include: args.include,
    exclude: [...exclude, ...(args.exclude ?? [])],
    ...(args.fileParallelism === undefined ? {} : { fileParallelism: args.fileParallelism }),
  },
});

// Config default export is required by Vitest's config loader.
export default defineConfig({
  test: {
    ...(coverage ? { coverage } : {}),
    projects: [
      defineProject({ name: "unit", include, exclude: [EMULATOR_TESTS, POSTGRES_TESTS] }),
      // One emulator per run: files that clear or reuse its data must not interleave.
      defineProject({ name: "emulators", include: [EMULATOR_TESTS], fileParallelism: false }),
      defineProject({ name: "postgres", include: [POSTGRES_TESTS] }),
    ],
  },
});
