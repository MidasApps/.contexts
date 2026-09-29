import { defineCoreVitestConfig } from "@core/config/vitest";

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

// Config default export is required by Vitest's config loader.
export default defineCoreVitestConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", exclude: ["**/node_modules/**", EMULATOR_TESTS, POSTGRES_TESTS] },
      },
      {
        extends: true,
        test: { name: "emulators", include: [EMULATOR_TESTS], testTimeout: 20_000 },
      },
      {
        extends: true,
        test: { name: "postgres", include: [POSTGRES_TESTS], testTimeout: 20_000 },
      },
    ],
  },
});
