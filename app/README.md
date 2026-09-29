# Agentic app core

Generic boilerplate for agentic applications: a pnpm + Turborepo workspace with
shared config, typed contracts, backend services, agents and thin app shells. It
carries no business rules; a derived application adds its own bounded contexts
as modules.

## Framework is read-only

`../.contexts` (single source of truth for engineering, product and business
doctrine) and `../.claude` (rules, skills, agents and hooks that operationalize
it) are the DDC framework. This workspace follows them and never edits them.
Decisions local to the boilerplate live in
`../docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`.

## Layout

```
app/
  apps/
    web/        Next 16: routing only; /v1 re-exports driving adapters
    desktop/    Tauri 2 + Vite + React 19: routing and native plugins only
    mastra/     Mastra server
    functions/  Firebase Functions Gen 2 (nodejs24, ADR 0004 E1)
  packages/
    client/     FSD (views, widgets, features, entities, shared); shared/ui is Atomic
    contracts/  Zod schemas, events, primitives, registry and data catalog
    services/   hexagonal bounded contexts
    agents/     agents, tools, skills, workflows, processors, scorers
    i18n/       messages and locale config
    config/     shared tsconfig presets, ESLint flat config, Vitest preset
  modules/      empty in the core; modules/example only proves the contract
```

Import boundaries are enforced by `eslint-plugin-boundaries`:

- `apps` only compose.
- `client` does not import `services` or `agents`.
- `services` and `agents` do not import `client`.
- `agents` reach `services` only through use cases.
- `contracts` depends on nothing.

## Toolchain

Node 26.10.0 (`.nvmrc`), pnpm 12.6.0 (`packageManager`), Turborepo, TypeScript 7
(`tsc`) with the TS 6 API only for lint (`.pnpmfile.cjs`, ADR 0004 E2), ESLint 9
(E3) and Vitest 5. Shared versions are pinned once in the `catalog:` of
`pnpm-workspace.yaml`.

```bash
pnpm install
pnpm lint        # turbo run lint
pnpm typecheck   # turbo run typecheck
pnpm test        # turbo run test
pnpm dev         # turbo run dev
```
