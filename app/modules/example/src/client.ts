import { defineClientModule } from "@core/client/app-shell";
import { EXAMPLE_CONTRACTS } from "./contracts/index.ts";
import { exampleManifest } from "./manifest.ts";

/**
 * The example module for the client shell (decision 0015 §3): the manifest plus its pages, keyed
 * by the path after `/m/example/` and loaded on first visit, and its contracts, so the chat
 * renders the form of a note command (`renderForm`, decision 0032) instead of the generic tool
 * view. Apps add it to their module list.
 */
export const exampleClientModule = defineClientModule({
  manifest: exampleManifest,
  pages: {
    "": async () => ({ default: (await import("./ui/ExampleHomePage.tsx")).ExampleHomePage }),
  },
  contracts: EXAMPLE_CONTRACTS,
});
