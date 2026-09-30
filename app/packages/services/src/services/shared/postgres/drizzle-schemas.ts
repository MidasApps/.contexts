import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Postgres schemas the app owns through Drizzle migrations (decision 0023).
 * `mastra` belongs to Mastra (`storage.init()`), `semantic` to `semantic_owner`
 * (views), so neither is declared here.
 */
// Knowledge base tables (`ai.documents`, `ai.chunks_v1`; decision 0022).
export const aiSchema = pgSchema("ai");
// LLM usage ledger and tenant budgets (`usage.llm_calls`, `usage.tenant_budgets`; decision 0026).
export const usageSchema = pgSchema("usage");
