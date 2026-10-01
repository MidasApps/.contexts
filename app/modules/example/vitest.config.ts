import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader.
// jsdom because the page tests render inside the real client composition (Testing Library + axe-core).
export default defineCoreVitestConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.ts"],
  },
});
