import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader.
// jsdom because nearly every client test renders components (Testing Library + axe-core).
export default defineCoreVitestConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/shared/testing/setup.ts"],
    // Every file is a jsdom worker that renders, types key by key and runs axe: CPU-bound for
    // seconds. One worker per core (Vitest's default) starves them as soon as anything else runs
    // on the machine (other suites, emulators), and tests that take 1–1.5 s idle then pass the
    // timeout. Half the cores keeps the run's wall time about the same and leaves headroom.
    maxWorkers: "50%",
    // The slowest tests (dialog + typing + axe) take about 1.5 s on an idle machine; Vitest's 5 s
    // default left too little margin under load. A hung test still fails, three times later.
    testTimeout: 15_000,
    // Outside a tenant the display zone falls back to the browser's (shell-intl-provider.tsx). The
    // host zone is pinned to UTC so dates read the same on every machine (rules/testing.md §5).
    env: { TZ: "UTC" },
  },
});
