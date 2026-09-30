import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader.
// jsdom because nearly every client test renders components (Testing Library + axe-core).
export default defineCoreVitestConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/shared/testing/setup.ts"],
  },
});
