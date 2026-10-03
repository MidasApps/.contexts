// Test data of the usage entity (settings usage view and the own-cap feature).
import { IDS } from "#/shared/testing/fixtures.ts";

type Json = Record<string, unknown>;

export const buildUsageTotals = (overrides: Json = {}): Json => ({ calls: 42, inputTokens: 50_000, outputTokens: 12_000, costMicroUsd: 12_340_000, unpricedCalls: 0, ...overrides });

export const buildUsageSummary = (overrides: Json = {}): Json => ({
  tenantId: IDS.organization,
  month: "2026-10",
  totals: buildUsageTotals(),
  budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000, alertThresholdPercent: 80 },
  byModel: [{ provider: "google", model: "gemini-3.5-flash", totals: buildUsageTotals() }],
  byDay: [
    { day: "2026-10-01", totals: buildUsageTotals({ calls: 40, costMicroUsd: 12_000_000 }) },
    { day: "2026-10-02", totals: buildUsageTotals({ calls: 2, costMicroUsd: 340_000 }) },
  ],
  byAgent: [
    { agentId: "assistant", totals: buildUsageTotals({ calls: 30, costMicroUsd: 10_000_000 }) },
    { agentId: "knowledge", totals: buildUsageTotals({ calls: 12, costMicroUsd: 2_340_000 }) },
  ],
  byUser: [
    { userId: IDS.user, totals: buildUsageTotals({ calls: 40, costMicroUsd: 12_000_000 }) },
    { userId: null, totals: buildUsageTotals({ calls: 2, costMicroUsd: 340_000 }) },
  ],
  ...overrides,
});

export const buildTenantAgentSettings = (overrides: Json = {}): Json => ({
  tenantId: IDS.organization,
  enabledAgents: ["knowledge", "data", "action"],
  webTools: { firecrawl: false, browser: false },
  guardrails: { pii: "redact" },
  budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
  updatedBy: null,
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T14:30:00.000Z",
  ...overrides,
});
