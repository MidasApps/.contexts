// The AI catalog is a generated artifact of `pnpm contracts:catalog` in `app/docs/catalog`,
// which is not a workspace package (no alias can point at it), so it is imported by
// relative path. The JSON import attribute makes Node load it natively and lets the
// Mastra bundler inline it into the server build (spec §8.2: "bundled at build").
import catalog from "../../../../../docs/catalog/catalog.ai.json" with { type: "json" };

/** Raw bundled `catalog.ai.json`; validate it with `createAiCatalogReader`. */
export const loadBundledAiCatalog = (): unknown => catalog;
