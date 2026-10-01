import { coreVitestConfig, EMULATOR_PROJECT_DEFAULTS } from "@core/config/vitest";
import { defineConfig } from "vitest/config";

/**
 * Tests are split by what they need, encoded in the file suffix:
 * - `*.test.ts` (unit): pure, `AI_MODE=fake`, no external process; `pnpm test`.
 * - `*.postgres.test.ts`: the local Postgres container; `pnpm test:postgres`.
 * - `*.emulator.test.ts`: the Firebase Emulator Suite; root `pnpm test:emulators`.
 * - `*.eval.test.ts`: eval sets; `pnpm evals` (fake models, CI gate) and
 *   `pnpm evals:real` (real providers, opt-in, skips without keys).
 */
const EMULATOR_TESTS = "src/**/*.emulator.test.ts";
const POSTGRES_TESTS = "src/**/*.postgres.test.ts";
const EVAL_TESTS = "src/**/*.eval.test.ts";

// Projects copy the preset instead of `extends: true`: mergeConfig concatenates
// arrays, so the preset's `include` would leak unit tests into every project.
const { coverage, include = [], exclude = [], ...presetDefaults } = coreVitestConfig.test ?? {};

const defineProject = (args: {
  name: string;
  include: string[];
  exclude?: string[];
  env?: Record<string, string>;
  overrides?: typeof EMULATOR_PROJECT_DEFAULTS;
}) => ({
  test: {
    ...presetDefaults,
    ...args.overrides,
    name: args.name,
    include: args.include,
    exclude: [...exclude, ...(args.exclude ?? [])],
    env: { AI_MODE: "fake", ...args.env },
  },
});

// Config default export is required by Vitest's config loader.
export default defineConfig({
  test: {
    ...(coverage ? { coverage } : {}),
    projects: [
      defineProject({ name: "unit", include, exclude: [EMULATOR_TESTS, POSTGRES_TESTS, EVAL_TESTS] }),
      defineProject({ name: "postgres", include: [POSTGRES_TESTS] }),
      defineProject({ name: "emulators", include: [EMULATOR_TESTS], overrides: EMULATOR_PROJECT_DEFAULTS }),
      defineProject({ name: "evals", include: [EVAL_TESTS] }),
      defineProject({ name: "evals-real", include: [EVAL_TESTS], env: { AI_MODE: "real" } }),
    ],
  },
});
