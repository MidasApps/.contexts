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

export const defineCoreVitestConfig = (overrides: ViteUserConfig = {}): ViteUserConfig =>
  mergeConfig(coreVitestConfig, overrides);
