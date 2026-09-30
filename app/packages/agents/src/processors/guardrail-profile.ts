/**
 * Guardrail profile of the agents (SP3 spec §12, decision 0026).
 *
 * `TOKEN_COST_CONTROL_ENABLED` records the SP3 Task 16 evaluation of Mastra's
 * `TokenCostControl` (a soft daily signal next to the own hard cap):
 * - probe (2026-09-30, `@mastra/pg` 1.27.1, local Postgres 18): with
 *   `PostgresStoreVNext` the cost metrics are recorded and `TokenCostControl`
 *   (`scope: 'organization'`) tripped on the second run, so metrics work;
 * - it stays off because turning it on means swapping the Mastra storage to
 *   `PostgresStoreVNext` with its own observability connection and schema,
 *   DDL for its signal tables in `db:init`, and Mastra's own price table
 *   (which does not price every model of `model-prices.ts`); Mastra documents
 *   that store for low-volume production only. The hard cap (tenant budget
 *   guard) and the 80 % alert already come from the own ledger.
 */
export const TOKEN_COST_CONTROL_ENABLED = false;
