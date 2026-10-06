import type { AgentCatalogEntry } from "@core/contracts";

/** A catalog entry in the shape of `agents.AgentCatalogEntry` (test data by factory). */
export const buildCatalogAgent = (overrides: Partial<AgentCatalogEntry> = {}): AgentCatalogEntry => ({
  key: "knowledge",
  name: "Knowledge",
  description: "Answers from the knowledge base with citations.",
  source: "core",
  moduleId: null,
  enabled: true,
  tools: [{ id: "knowledge.search", kind: "read", source: "core" }],
  skills: [{ name: "knowledge-citations", description: "How to cite knowledge base passages.", source: "core" }],
  ...overrides,
});
