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

/** A row of `GET /v1/admin/agents` (the default is the `knowledge` subagent). */
export const buildAdminAgent = (overrides: Json = {}): Json => ({
  id: "knowledge",
  name: "Knowledge",
  description: "Answers questions about the organization's documents, citing every claim.",
  role: "subagent",
  enablement: "per-organization",
  subagents: [],
  tools: ["knowledge.searchKnowledge"],
  toolsVaryByOrganization: false,
  skills: ["knowledge-citations"],
  permissions: ["core.chat.use", "core.knowledge.read"],
  ...overrides,
});

/** The catalog of a runtime with the core agents and one module agent. */
export const buildAgentCatalog = (): Json[] => [
  buildAdminAgent({ id: "assistant", name: "Assistant", role: "supervisor", enablement: "always", subagents: ["knowledge", "data", "example-notes"], tools: [], toolsVaryByOrganization: true, skills: [], permissions: ["core.chat.use"] }),
  buildAdminAgent({ id: "ping", name: "Ping", description: "Answers a health check.", role: "entry", enablement: "always", tools: ["catalog.listEntities"], skills: [] }),
  buildAdminAgent(),
  buildAdminAgent({ id: "data", name: "Data", tools: ["catalog.listEntities", "sql.querySemanticSql"], toolsVaryByOrganization: true, skills: ["data-catalog"] }),
  buildAdminAgent({ id: "example-notes", name: "Notes helper", description: "Finds the notes of the example module.", tools: [], skills: [], permissions: ["example.note.read"] }),
];

export const buildAgentSettings = (overrides: Json = {}): Json => ({
  tenantId: IDS.organization,
  enabledAgents: ["knowledge", "data", "action"],
  webTools: { firecrawl: false, browser: false },
  guardrails: { pii: "redact" },
  budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
  ownBudget: null,
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
