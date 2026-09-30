# @core/agents

Agent runtime of the core (SP3): model roles, the agent env, and (in later SP3
tasks) registries, tools, agents, processors, scorers, fake models and the Mastra
auth provider. `apps/mastra` composes it; the package never imports a module or
`@core/client` (decision 0019).

## When to use

- Read the model roles (`MODEL_ROLES`, `parseModelId`) and the env
  (`AgentEnvSchema` + `resolveAgentEnv`) from an app's `src/env.ts`; see
  `apps/mastra/src/mastra-env.schema.ts`.
- `AI_MODE=fake` runs everything offline and is allowed only in `local`/`dev`
  (decision 0021). In `real` mode the boot needs the provider key of every text
  and embedding role (and of their fallbacks); voice keys are optional.

- Knowledge (SP3 Tasks 14-15): `knowledge-ingest` and `catalog-reindex` workflows,
  the `knowledge.searchKnowledge` tool, the `citation-guard` output processor and the
  `knowledge` agent (decision 0022 amendments). Agent instructions live in
  `src/agents/instructions/<agent>.v<N>.md`; core skills in `skills/<name>/SKILL.md`.

## How to test

```bash
pnpm -F @core/agents test            # unit (*.test.ts), AI_MODE=fake
pnpm -F @core/agents test:postgres   # *.postgres.test.ts, needs the compose Postgres
pnpm -F @core/agents test:emulators  # *.emulator.test.ts, run through root `pnpm test:emulators`
pnpm -F @core/agents evals           # *.eval.test.ts with fake models (CI gate)
pnpm -F @core/agents evals:real      # same sets with real providers (opt-in, needs keys)
pnpm -F @core/agents lint
pnpm -F @core/agents typecheck
```

## References

- `../../../docs/superpowers/specs/2026-09-29-sp3-agentic-runtime-design.md`
- `../../docs/decisions/0019-agent-runtime-layout-and-request-context.md`,
  `../../docs/decisions/0021-model-roles-and-fake-mode.md`
- `.contexts/engineering/stacks/ai/mastra-sdk.md`
