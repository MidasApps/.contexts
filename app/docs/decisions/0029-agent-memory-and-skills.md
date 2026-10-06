# 0029. Agent memory defaults and skills without a workspace

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents/src/memory`, `app/packages/agents/skills`, agent definitions (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-19, D3-21 (§7, §10)

## Context

Memory must be bounded (`stacks/ai/mastra-sdk.md`: `lastMessages` always capped) and isolated per tenant: one user can belong to several organizations. Observational Memory defaults to a Gemini model and its value versus semantic recall is unmeasured (umbrella §7, §14 item 6). Mastra Agent Skills can be attached through a `Workspace`, but a workspace with a writable filesystem also gives the agent file-write and delete tools.

## Decision

1. **D3-19 — Memory.** `new Memory({ storage, vector: PgVector (schema mastra), embedder, options: { lastMessages: 20, semanticRecall: { topK: 4, messageRange: 1, scope: 'resource' }, workingMemory: { enabled: true, scope: 'resource', schema: WorkingMemorySchema }, generateTitle: { model: fast } } })`. `WorkingMemorySchema` holds preferences only (language, tone, recurring goals), never secrets; pii `personal`. `resourceId = tenantId:uid` (server-set), `threadId = conversationId`, so a user in two organizations has two resources. Observational Memory stays off (`AI_MEMORY_OBSERVATIONAL=false`) until a comparative eval with real keys (SP3 Task 22) shows it pays off.
2. **D3-21 — Skills.** Core skills are `SKILL.md` directories in `packages/agents/skills/` (`data-catalog`, `knowledge-citations`, `safe-actions`), validated in a unit test; module skills come from `AgentModule.skills`. They are attached with the agent-level `skills` option (a function of `requestContext`, so a tenant sees only skills of modules it enabled). No `Workspace` is used; the skill tools (`skill`, `skill_read`, `skill_search`) are read-only.

## Consequences

- A test with two tenants and the same uid proves recall and working memory never cross.
- Agents cannot write files through skills.
- If OM is enabled later, its model is set explicitly (no silent default).

## Alternatives rejected

- **Thread-scoped recall only.** Loses useful context across a user's conversations inside the same tenant.
- **Observational Memory on by default.** Unmeasured cost and quality; the default model would be picked implicitly.
- **Workspace-based skills.** Adds file-write and delete tools the agents must not have.

## Amendments

- **2026-09-30 — memory wiring and thread ownership (SP3 Task 18).** `createMemory` builds one
  `Memory` per runtime (`@mastra/memory` 1.32.1) over the Mastra storage and a `PgVector` in schema
  `mastra` (index `memory_messages`, 1536 dimensions, metadata indexes on `thread_id` and
  `resource_id`). The runtime role has no CREATE on the schema, so `db:init` creates the index
  with the same parameters Memory uses, and the vector store gets `disableInit` outside local.
  `@mastra/memory` embeds only with AI SDK v2/v3 embedding models, so memory receives a v3 view
  of the factory's v4 embedder (same model, same vectors). Mastra refuses a thread of another
  resource only inside the run (a 500 on `generate`), so the context middleware looks up the
  owner of every thread a request names (`X-Conversation-Id`, `/memory/threads/:threadId`) and
  answers 403 first; a failed lookup answers 503 (fail-closed). Observational Memory, when
  enabled, uses the `fast` role and resource scope. No agent attaches the memory yet: the
  supervisor of Task 20 does (`AgentFactoryDeps.memory`).
- **2026-09-30 — skills attached (SP3 Task 20).** Each `SKILL.md` is loaded at boot with
  `validateSkillContent` and attached as an inline skill (`createSkill`): `data-catalog` on
  `data`, `knowledge-citations` on `knowledge`, `safe-actions` on `action`; module skills
  (named `<module>-<skill>`) join an agent only in tenants whose `enabledAgents` names the
  module or one of its agents. `apps/mastra` copies `packages/agents/skills` next to the
  bundle (`public/skills`). The supervisor attaches the memory; subagents have none of their
  own. Mastra sends tool names to the model sanitized (`catalog.listEntities` becomes
  `catalog_listEntities`) once an agent has skills; stream chunks carry the sanitized name.
- **2026-09-30 — Observational Memory comparison not run (SP3 Task 28).** No provider key is
  configured, so no real comparison exists and OM stays off (`AI_MEMORY_OBSERVATIONAL=false`).
  The harness (`src/evals/memory-comparison.ts`, dataset `evals/datasets/memory.v1.jsonl`,
  config A = default memory, config B = the same with the flag on) runs in `pnpm evals` with
  fake models to prove it works; a fake run never recommends enabling. Enabling needs a real
  run (`pnpm -F @core/agents exec vitest run --project evals-real memory-comparison`) where B scores ≥ A at ≤ 1.2× A's
  cost, on conversations long enough to cross OM's 30 000-token observation threshold
  (memory.v1 is not). Report: `docs/plans/2026-09-29-sp3-agentic-runtime/reports/om-comparison.md`.
