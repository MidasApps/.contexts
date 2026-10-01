import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config";

/**
 * Shared Vitest defaults (.contexts/engineering/stacks/testing/vitest.md):
 * node environment, explicit imports (`globals: false`), colocated `*.test.ts`.
 * Packages pass only what differs, e.g. `include` or a DOM environment.
 */
export const coreVitestConfig: ViteUserConfig = defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/types.ts"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});

/**
 * Defaults of every `emulators` project (root `pnpm test:emulators`). One Emulator Suite serves
 * every package, which turbo runs one at a time, and files that seed, clear or reuse its data
 * must not interleave either, so files run serially. The first rules load or Admin SDK call on
 * a cold emulator takes seconds on a busy machine, past Vitest's 5 s / 10 s defaults.
 */
export const EMULATOR_PROJECT_DEFAULTS = {
  fileParallelism: false,
  testTimeout: 30_000,
  hookTimeout: 60_000,
} as const;

export const defineCoreVitestConfig =(overrides: ViteUserConfig = {}): ViteUserConfig =>
  mergeConfig(coreVitestConfig, overrides);
