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
