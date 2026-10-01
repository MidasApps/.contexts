import { defineClientModule } from "@core/client/app-shell";
import { exampleManifest } from "./manifest.ts";

/**
 * The example module for the client shell (decision 0015 §3): the manifest plus its pages, keyed
 * by the path after `/m/example/` and loaded on first visit. Apps add it to their module list.
 */
export const exampleClientModule = defineClientModule({
  manifest: exampleManifest,
  pages: {
    "": async () => ({ default: (await import("./ui/ExampleHomePage.tsx")).ExampleHomePage }),
  },
});
