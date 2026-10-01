// Test data factories of `/admin/agents` and its prompt pages (rules/testing.md: data by factory).
// Shapes follow the `@core/contracts` examples so the fake API answers parse like real ones.
import { IDS } from "./fixtures.ts";

type Json = Record<string, unknown>;

export const PROMPT_IDS = {
  v1: "01927f3c-0000-7000-8000-000000000001",
  v2: "01927f3c-0000-7000-8000-000000000002",
  v3: "01927f3c-0000-7000-8000-000000000003",
  activation1: "01927f3d-0000-7000-8000-000000000001",
  activation2: "01927f3d-0000-7000-8000-000000000002",
} as const;

export const buildAgentSettings = (overrides: Json = {}): Json => ({
  tenantId: IDS.organization,
  enabledAgents: ["knowledge", "data", "action"],
  webTools: { firecrawl: false, browser: false },
  guardrails: { pii: "redact" },
  budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
  updatedBy: IDS.user,
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T14:30:00.000Z",
  ...overrides,
});

export const buildPromptVersion = (overrides: Json = {}): Json => ({
  id: PROMPT_IDS.v1,
  agentId: "assistant",
  scope: "platform",
  tenantId: null,
  version: 1,
  body: "You are the assistant.\nBe brief.\nCite sources.",
  bodySha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  note: null,
  evalExperimentId: null,
  evalVerdict: null,
  createdBy: IDS.user,
  createdAt: "2026-09-29T14:30:00.000Z",
  ...overrides,
});

export const buildPromptActivation = (overrides: Json = {}): Json => ({
  id: PROMPT_IDS.activation1,
  agentId: "assistant",
  scope: "platform",
  tenantId: null,
  versionId: PROMPT_IDS.v1,
  forced: false,
  reason: null,
  activatedBy: IDS.user,
  activatedAt: "2026-09-29T15:00:00.000Z",
  ...overrides,
});

export const buildPromptEvalResult = (overrides: Json = {}): Json => ({
  versionId: PROMPT_IDS.v3,
  experimentId: "exp_01J8Z3K4M5",
  verdict: "passed",
  scorers: [
    { scorerId: "tool-routing", mean: 0.94, passed: true },
    { scorerId: "tenant-leak", mean: 1, passed: true },
  ],
  ...overrides,
});
