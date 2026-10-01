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
