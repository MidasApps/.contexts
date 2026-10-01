import path from "node:path";
import { defineCoreVitestConfig } from "@core/config/vitest";

// Config default export is required by Vitest's config loader. The app's Vite
// plugins (router generator, React, Tailwind) stay out of unit tests on purpose:
// tests use the committed routeTree.gen.ts. jsdom because adapters and the route
// tree render inside the real client composition. mergeConfig concatenates
// arrays: this adds the build scripts to the preset's src/** include.
export default defineCoreVitestConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.ts"],
    include: ["scripts/**/*.test.ts"],
  },
});
