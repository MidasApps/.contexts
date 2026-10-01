# @core/agents

Agent runtime of the core (SP3): model roles and the agent env, fake models, the Mastra
auth provider and request context, the tool pipeline (`defineCoreTool`), agents
(supervisor + subagents), skills, memory, knowledge base workflows, connectors, the core
MCP server, guardrails, the usage ledger, observability, voice and the eval gate.
`apps/mastra` composes it with `composeAgentRuntime`; the package never imports a module
or `@core/client` (decision 0019).

## When to use

- **Env and models.** Read `AgentEnvSchema` + `resolveAgentEnv` from an app's env (see
  `apps/mastra/src/mastra-env.schema.ts`); models come from `createModelProvider` by role
  (`chat`, `fast`, `reasoning`, `judge`, `embedding`, voice), never by id in code
  (decision 0021).
- **`AI_MODE`.** `fake` runs everything offline with a scripted model (directives
  `[[fake:text|tool-call|injection|pii|moderation|slow|error …]]` plus keyword rules per
  agent), hashed 1536-dimension embeddings and fake voice; allowed only in `local`/`dev`.
  `real` needs the provider key of every text and embedding role (voice keys optional).
- **Agents.** `assistant` is the supervisor and the only entry point; it delegates to the
  `knowledge`, `data`, `action` and `web` subagents the tenant enabled
  (`agent-settings.enabledAgents`; `web` also needs a web-tool opt-in). `ping` checks the
  fast role. Instructions are versioned files `src/agents/instructions/<agent>.v<N>.md`.
- **Memory** (decision 0029): history 20, semantic recall topK 4 and working memory, all
  scoped to the resource `tenantId:uid`; Observational Memory is off
  (`AI_MEMORY_OBSERVATIONAL=false`) until a real comparison says otherwise
  (`src/evals/memory-comparison.ts`).

## How to add a capability from a module

A module never touches the core. Its server entry exports one `defineAgentModule(...)`
value and the app lists it in `apps/mastra/src/modules.ts` (`APP_MODULES`); every id is
prefixed with the module id, and a manifest ref without an implementation is a boot
error (`AgentModuleError`).

```ts
import { defineAgentModule, defineCoreTool } from "@core/agents";
import { z } from "zod";

const listNotes = defineCoreTool({
  id: "notes.listNotes", // <area>.<name>, area = module id
  description: "Use when the user asks which notes exist in the current project.",
  kind: "read", // "mutation" requires approval and is audited as AGENT_TOOL_EXECUTED
  permission: "notes.note.read", // checked with SP1 authorize() on every call
  inputSchema: z.strictObject({ limit: z.int().min(1).max(50).describe("How many notes to return.") }),
  outputSchema: z.object({ notes: z.array(z.object({ id: z.string(), title: z.string() })) }),
  execute: async (input, ctx) => ({ notes: [] }), // ctx.tenantId comes from the verified principal, never from the model
});

export const notesAgentModule = defineAgentModule({
  id: "notes",
  tools: [listNotes],
  agents: [{ id: "notes-assistant", ceiling: ["notes.note.read"], create: (deps) => /* new Agent({...}) with deps.models, deps.guardrails("delegated") */ }],
  commands: [/* { tool: defineCoreTool({ id: "command.notes.CreateNote", kind: "mutation", ... }), targetContractId: "notes.Note" } */],
  skills: [/* createSkill({ name: "notes-writing", ... }) */],
});
```

| Capability | How | Notes |
|---|---|---|
| Tool | `tools: [defineCoreTool(...)]` | Strict, described input; permission `<module>.<resource>.<action>`; tenant, principal, run id and abort signal arrive in `ctx`. The pipeline authorizes, times out (15 s read / 30 s mutation), checks the output and audits. |
| Command (mutation) | `commands: [{ tool, targetContractId }]`, tool id `command.<module>.<Name>` | Offered to the `action` agent; Mastra asks the user to approve every call; a permission flagged `requiresApproval` also creates an SP1 approval request (`agent-command`, four eyes); runs at most once per `runId:toolCallId` (decision 0025). `catalog.renderForm` renders its form when `targetContractId` is a catalog contract. |
| Agent | `agents: [{ id, ceiling, role?, create }]` | `subagent` (default) is reached only through the supervisor, in tenants whose `enabledAgents` lists it; tool permissions = context ∩ `ceiling`. Spread `deps.guardrails("delegated")` (or `"entry"` for `role: "entry"`). |
| Skill | `skills: [createSkill({ name: "<module>-<skill>", ... })]` | Attached inline (no Workspace, so no file-write tools); shown only to tenants that enabled the module (decision 0029). |
| Workflow | not a module capability yet | `AgentModule` has no `workflows` field in SP3; core workflows (`knowledge-ingest`, `catalog-reindex`) are registered by `composeAgentRuntime`. SP5 owns module workflows and HITL steps (decision 0036). |
| Connector | tenant data, not module code | OpenAPI, MCP (http; stdio only local), browser (Playwright MCP) and Postgres read-only connectors are created per tenant through `/v1/organizations/{organizationId}/connectors`; secrets go to the secret store; tools appear per run for the matching agent kind (decision 0027). |
| Knowledge | not a module capability yet | Namespace `module:<moduleId>` is reserved (spec §11), but `searchKnowledge` allows only `tenant`, the active `project:*` and `catalog` until tenants can enable modules (SP5 agent settings). Tenant documents go through `/v1/organizations/{organizationId}/knowledge/sources`. |

Every new agent needs an eval set: add `evals/datasets/<agent>.v1.jsonl` (10–30 cases),
`evals/baselines/<agent>.json` and a `src/evals/<agent>.eval.test.ts` (decision 0028).

## How to test

```bash
pnpm -F @core/agents test            # unit (*.test.ts), AI_MODE=fake
pnpm -F @core/agents test:postgres   # *.postgres.test.ts, needs the compose Postgres + pnpm db:migrate
pnpm -F @core/agents test:emulators  # *.emulator.test.ts, run through root `pnpm test:emulators`
pnpm -F @core/agents evals           # *.eval.test.ts with fake models (CI gate) → app/.evals/*.json
pnpm -F @core/agents evals:real      # same sets with real providers + judge (opt-in, skips without keys)
pnpm -F @core/agents lint
pnpm -F @core/agents typecheck
```

`pnpm evals:seed` (root) copies the datasets into Mastra datasets for Studio and experiments.

## References

- `../../../docs/superpowers/specs/2026-09-29-sp3-agentic-runtime-design.md`
- `../../docs/decisions/0019-agent-runtime-layout-and-request-context.md` … `0029-agent-memory-and-skills.md`
- `../../../docs/plans/2026-09-29-sp3-agentic-runtime/reports/sp3-gate.md`
- `.contexts/engineering/stacks/ai/mastra-sdk.md`
