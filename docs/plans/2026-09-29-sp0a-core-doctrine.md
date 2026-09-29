# SP0a — Doutrina do core agêntico: implementation plan

> **For agentic workers:** Use skill `using-ddc` before coding. Prefer subagent-per-task
> with templates in `writing-plans-ddc` (implementer + task-reviewer). Track progress in
> `.claude/agent-memory/progress.md`.

**Goal:** registrar em `.contexts/` (ADRs + contextos) todas as decisões da spec
`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` antes de qualquer código
que dependa delas.

**Architecture:** só documentação. ADRs MADR em `.contexts/engineering/decisions/`
(0006–0013); contextos novos/atualizados em `rules/`, `contracts/`, `architecture/`,
`stacks/`, `processes/`; espelho mínimo em `.claude/` (só ponteiros).

**Tech Stack:** Markdown. Pins de referência medidos em 2026-09-29 (`npm view`):
Node 26.10.0 (baseline), TS 7.0.2, Next **16.3.7** (novo), React 19.3.0, Zod 4.6.5,
Vitest 5.0.2, `ai` **7.0.122**, `@mastra/core` 1.71.0, `mastra` 1.31.3,
`@mastra/auth-firebase` 1.1.2, `@mastra/ai-sdk` 1.10.5, `@mastra/pg` 1.27.1,
`@mastra/memory` 1.32.1, `@mastra/rag` 2.6.4, `@mastra/mcp` 2.1.0,
`@mastra/observability` 1.18.1, `@mastra/loggers` 1.3.2,
`@mastra/google-cloud-pubsub` 1.1.3, `@ai-sdk/react` 4.0.125, pnpm 12.6.0,
turbo 2.11.5, `@tauri-apps/cli`/`api` 2.12.0, vite 8.3.1,
`@tanstack/react-router` 1.170.40, `next-intl`/`use-intl` 4.14.8, firebase 12.19.0,
firebase-admin 14.5.0, firebase-tools 15.32.0, drizzle-orm 0.45.3,
`eslint-plugin-boundaries` 7.2.0, shadcn CLI 4.21.0,
`@firebase/rules-unit-testing` 5.0.2. `@mastra/evals` 1.10.3 segue com peer
`vitest <5` (E4 mantida).

## Global Constraints

- Pins de `@.contexts/engineering/MEMORY.md` + medição acima; nada fora do `latest`
  sem linha no ADR 0004.
- Formato e imutabilidade de ADR: `@.contexts/engineering/decisions/README.md` e skill
  `decisions`. Não editar ADR accepted (só Amendments / linha de exceção na 0004).
- Doutrina não se duplica: contexto novo linka `@.contexts/...` existentes.
- Frontmatter de contexto igual aos existentes (`title`, `type`, `status`,
  `last_updated: 2026-09-29`, `upstream` quando stack).
- Nenhuma menção a domínio de negócio específico: o core é genérico.
- Commits: `docs(contexts): ...` (rule `commits`), um por task.

**Verify comum (todas as tasks):** link check de `@.contexts/...` e de links relativos:

```bash
cd /c/Projetos/.contexts
for f in $(git diff --name-only HEAD~1 HEAD -- '*.md'); do
  for p in $(grep -oE '@\.contexts/[A-Za-z0-9_@./-]+\.md' "$f" | sort -u); do
    [ -f "${p#@}" ] || echo "MISSING $p in $f"; done; done; echo done
```
Expected: só `done`.

---

### Task 1: Baseline de versões e novos stacks na matriz

**Contexts (Read first):**
- `@.contexts/engineering/MEMORY.md`
- `@.contexts/engineering/stacks/VERSIONS.md`
- `@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md`

**Files:**
- Modify: `.contexts/engineering/MEMORY.md` (Next 16.3.7, `ai` 7.0.122, linhas novas:
  Monorepo pnpm 12.6.0 + turbo 2.11.5; Desktop Tauri 2.12.0 + Vite 8.3.1 + TanStack
  Router 1.170.40; i18n next-intl/use-intl 4.14.8; Firebase client 12.19.0 / tools 15.32.0)
- Modify: `.contexts/engineering/stacks/VERSIONS.md` (medição 2026-09-29)

- [ ] Step 1: Read contexts
- [ ] Step 2: Re-medir com `npm view <pkg> version` (lista do header) e anotar data
- [ ] Step 3: Atualizar matriz e invariantes (monorepo `engines` `>=26 <27`, Functions `>=24 <25`)
- [ ] Step 4: Verify comum + ledger + commit `docs(contexts): bump baseline and add monorepo, desktop, i18n pins`

**Verify:** `grep -n "16.3.7\|pnpm\|Tauri\|next-intl" .contexts/engineering/MEMORY.md` → 4+ linhas.

### Task 2: ADR 0006 — Monorepo e mapeamento da doutrina `src/` → pacotes

**Contexts:** `@.contexts/engineering/processes/git.md` (§20),
`@.contexts/engineering/architecture/fsd.md`, `@.contexts/engineering/architecture/feature-based.md`,
`@.contexts/engineering/architecture/atomic-design.md`, `@.contexts/engineering/contracts/schemas.md`,
`@.contexts/engineering/decisions/0003-cross-doc-convention-conflicts-resolved.md`

**Files:**
- Create: `.contexts/engineering/decisions/0006-monorepo-layout-and-package-boundaries.md`
- Create: `.contexts/engineering/architecture/monorepo.md` (pacotes `apps/{web,desktop,mastra,functions}`,
  `packages/{client,contracts,services,agents,i18n,config}`, `modules/`; tabela
  "path da doutrina → path no monorepo" (`src/services/<ctx>` → `packages/services/src/services/<ctx>`, etc.);
  regras de import enforced por `eslint-plugin-boundaries`; pipelines Turbo; `defineModule()` apontando para `contracts/agents.md`)
- Modify: `processes/git.md` §20 (layout definido → link), nota curta de mapeamento em
  `architecture/fsd.md`, `feature-based.md`, `atomic-design.md`, `contracts/schemas.md` §2
- Modify: `decisions/README.md` (índice), `MEMORY.md` (Architecture: 7 modelos)

- [ ] Steps: read → ADR (Context, Drivers, Options: src único / monorepo / pacotes npm; Outcome: monorepo) → contexto → notas → verify → ledger → commit `docs(contexts): add monorepo adr and architecture context`

**Verify:** comum + `ls .contexts/engineering/architecture/monorepo.md`.

### Task 3: ADR 0007 — Desktop/mobile com Tauri 2

**Contexts:** `@.contexts/engineering/stacks/frontend/react@19.md`, `@.contexts/engineering/stacks/frontend/next@16.md`,
`@.contexts/engineering/rules/security.md`, `@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md`

**Files:**
- Create: `decisions/0007-desktop-and-mobile-shell-with-tauri-2.md` (opções: web-first PWA / Tauri 2 / Expo; outcome Tauri 2 desde a v1; `/admin` só web)
- Create: `stacks/desktop/tauri@2.md` (Tauri 2.12, Rust toolchain estável, capabilities/permissions, IPC seguro, CSP, updater assinado, Android, plugins como ports HAL, `10.0.2.2` no emulator Android)
- Create: `stacks/frontend/vite.md` (Vite 8 como bundler do shell desktop; Tailwind via plugin; aliases iguais ao web)
- Create: `stacks/frontend/tanstack-router.md` (roteamento do shell desktop; file-based; adapter do port `shared/lib/router`)
- Modify: `MEMORY.md` (índice de stacks)

- [ ] Steps: read → ADR → 3 stacks → verify → ledger → commit `docs(contexts): add tauri desktop adr and stacks`

**Verify:** comum.

### Task 4: ADRs 0008 (dados) e 0009 (topologia de runtime)

**Contexts:** `@.contexts/engineering/stacks/ai/mastra-sdk.md`, `@.contexts/engineering/stacks/database/firebase-firestore.md`,
`@.contexts/engineering/stacks/database/postgres.md`, `@.contexts/engineering/stacks/database/pgvector.md`,
`@.contexts/engineering/stacks/backend/firebase-functions.md`, `@.contexts/engineering/rules/api-design.md`,
`@.contexts/engineering/processes/deploy.md`

**Files:**
- Create: `decisions/0008-data-stores-split-firestore-postgres-storage-bigquery.md` (fato: Mastra sem storage/vector Firestore — docs `mastra.ai/docs/storage` 2026-09-29; Data Connect fora da v1 por PGlite no emulator)
- Create: `decisions/0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md`
- Create: `stacks/backend/cloud-run.md` (Mastra server: `mastra build` → Docker `node:26-alpine`, `PORT`, SIGTERM, min instances, concorrência, Cloud SQL via conector/VPC, Secret Manager)
- Create: `stacks/backend/firebase-platform.md` (Auth/Identity Platform, App Hosting, Storage, App Check, Remote Config, FCM, Emulator Suite: portas e flags)
- Modify: `processes/deploy.md` (componentes: App Hosting, Cloud Run, Functions, Tauri; ordem e rollback por componente)

- [ ] Steps: read → 2 ADRs → 2 stacks → deploy → verify → ledger → commit `docs(contexts): add data split and runtime topology adrs`

**Verify:** comum.

### Task 5: ADR 0010 — Tenancy e acesso + `rules/tenancy.md` + glossário

**Contexts:** `@.contexts/engineering/contracts/firebase-firestore.md` (§7), `@.contexts/engineering/rules/security.md`,
`@.contexts/engineering/rules/data-modeling.md`, `@.contexts/business/glossary.md`

**Files:**
- Create: `decisions/0010-tenancy-organization-project-units-and-rbac.md` (Org→Projeto→Unidades; claims como projeção ≤1000 bytes; `access/{tenantId}_{uid}`; escrita cliente negada; sem deny; teto de permissões de agente; `requiresApproval`)
- Create: `rules/tenancy.md` (imperativos: tenant server-bound, cross-check, fail-closed, herança, troca de org, device/service/staff principals, impersonation auditada)
- Modify: `contracts/firebase-firestore.md` §7 → link para `rules/tenancy.md` (texto já prevê)
- Modify: `.contexts/business/glossary.md` (Organização, Projeto, Unidade, Membro, Papel, Permissão, Principal, Dispositivo, Módulo, Agente, Tool, Skill, Conector, Thread, Knowledge base — com sinônimos proibidos; remover banner de template só da tabela preenchida)
- Modify: `MEMORY.md` (Rules: 19)

- [ ] Decidir `firebase-admin` 13.x trazido por `@mastra/auth-firebase@1.1.2` (ver MEMORY invariante 8): exceção E7 no ADR 0004 (E6 já é App Hosting), `pnpm.overrides` validado por teste, ou não adotar o pacote — registrar no ADR 0010
- [ ] Steps: read → ADR → rule → glossário → verify → ledger → commit `docs(contexts): add tenancy adr, rule and core glossary`

**Verify:** comum + `grep -c "^| " .contexts/business/glossary.md` ≥ 17.

### Task 6: ADR 0011 — Contratos como catálogo de dados

**Contexts:** `@.contexts/engineering/contracts/schemas.md`, `@.contexts/engineering/contracts/api.md` (§6, §15),
`@.contexts/engineering/contracts/events.md`, `@.contexts/engineering/contracts/postgres.md`,
`@.contexts/engineering/stacks/validation/zod@4.md`, `@.contexts/business/compliance.md`

**Files:**
- Create: `decisions/0011-contracts-as-machine-readable-data-catalog.md`
- Create: `contracts/data-catalog.md` — fonte única por tipo (tabela da spec §5); meta obrigatório
  via registry Zod 4 (`id`, `description`, `examples`, `pii`, `tenancyScope`, `relations`, `ui`);
  artefatos (`docs/openapi/v1.yaml`, JSON Schema, `docs/catalog/**`, views semânticas);
  `contracts:catalog` / `contracts:check`; paridade Drizzle↔Zod; 4 usos pela IA (conhecer,
  `renderForm`, SQL read-only semântico, comando→tool) com guard-rails
- Modify: `contracts/schemas.md` (seção curta "Metadados de catálogo" → link)
- Modify: `contracts/api.md` §12 — remover/ajustar `POST /v1/auth/refresh` conforme ADR 0010 (conflito registrado lá; review Task 5)
- Modify: `MEMORY.md` (Contracts: 10 com agents)

- [ ] Steps: read → ADR → contrato → link → verify → ledger → commit `docs(contexts): add data catalog contract`

**Verify:** comum.

### Task 7: ADR 0012 — Runtime agêntico + contratos e regras de agentes

**Contexts:** `@.contexts/engineering/stacks/ai/mastra-sdk.md`, `@.contexts/engineering/stacks/ai/harness-engineering.md`,
`@.contexts/engineering/stacks/ai/vercel-ai-sdk.md`, `@.contexts/engineering/rules/governance.md`,
`@.contexts/engineering/rules/observability.md`, `@.contexts/engineering/stacks/frontend/shadcn-ui.md`

**Files:**
- Create: `decisions/0012-agent-runtime-supervisor-subagents-and-module-contract.md` (supervisor; `.network()` proibido; RequestContext; memória; durable+PubSub; auth provider próprio conforme ADR 0010)
- Create: `contracts/agents.md` (ids, shapes de agent/tool/skill/workflow/processor/scorer; `defineModule()` com campos da spec §3; teto de permissões; aprovação; tools geradas de comandos)
- Create: `rules/ai-agents.md` (cap de steps, mutação com aprovação, orçamento por tenant, citação em RAG, conteúdo recuperado não confiável, eval antes de trocar modelo/prompt, sem prompt em string solta)
- Modify: `stacks/ai/mastra-sdk.md` — atualizar para docs de 2026-09-29: supervisor/subagents,
  RequestContext, Skills, Observational Memory, durable agents/PubSub, processors, scorers
  (`createScorer` de `@mastra/core/evals`), datasets/experiments, auth provider próprio (`MastraAuthProvider`, ADR 0010; `@mastra/auth-firebase` não adotado),
  `@mastra/ai-sdk` (`version: 'v7'`), Studio + Editor, voice, **Firestore não suportado**,
  deploy Docker/Cloud Run (deployer Vercel → "não usado no core v1")
- Modify: `stacks/ai/harness-engineering.md` (tabela camada → pacote do core)
- Create: `stacks/frontend/ai-elements.md` (AI Elements sobre shadcn + `useChat`; instalação pela doc oficial — confirmar comando no dia)
- Create: `stacks/ai/firecrawl.md` (scrape/crawl/search como tool opt-in; custo; SSRF; robots/ToS)
- Modify: `MEMORY.md`

- [ ] Steps: read → ADR → contracts/agents → rule → mastra-sdk → harness → 2 stacks → verify → ledger → commit `docs(contexts): add agent runtime adr, contracts and rules`

**Verify:** comum + `grep -n "network()" .contexts/engineering/stacks/ai/mastra-sdk.md` mostra só menção de deprecated.

### Task 8: ADR 0013 — i18n, moeda e fuso

**Contexts:** `@.contexts/engineering/rules/internationalization.md`, `@.contexts/engineering/rules/data-modeling.md`,
`@.contexts/engineering/stacks/frontend/next@16.md`, `@.contexts/engineering/stacks/runtime/node@26.md`

**Files:**
- Create: `decisions/0013-i18n-library-and-locale-currency-timezone-resolution.md` (next-intl web + use-intl desktop; cadeias: locale usuário→projeto→org; moeda nó→projeto→org; fuso usuário→nó→projeto→org→navegador; vigência no fuso do nó; câmbio só com cotação registrada)
- Modify: `rules/internationalization.md` (seção "Resolução de contexto" → link ADR)
- Modify: `rules/data-modeling.md` (nota `Money` + câmbio registrado → link)

- [ ] Steps: read → ADR → 2 notas → verify → ledger → commit `docs(contexts): add i18n, currency and timezone adr`

**Verify:** comum.

### Task 9: Ambiente local, design system e produto

**Contexts:** `@.contexts/engineering/processes/environments.md`, `@.contexts/product/design-system.md`,
`.design-system/DESIGN.md`

**Files:**
- Modify: `processes/environments.md` §9 (setup real: Node 26 + pnpm 12; `pnpm dev` sobe Emulator Suite
  `auth,firestore,functions,storage,pubsub,eventarc` + `docker compose` pgvector + `next dev` + `mastra dev`;
  `--import/--export-on-exit .firebase-data`; `pnpm seed:local`; `AI_MODE=fake`; `tauri dev`)
- Modify: `.contexts/product/design-system.md` (aponta para `.design-system/DESIGN.md` como fonte de tokens; shadcn new-york + Radix; mantém aviso de que não se inventam tokens)

- [ ] Steps: read → edits → verify → ledger → commit `docs(contexts): define local setup and design system source`

**Verify:** comum.

### Task 10: Sincronizar `.claude/` com a doutrina nova

**Contexts:** `@.contexts/engineering/decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`, `CLAUDE.md`, `.claude/settings.json`, `.claude/skills/*/SKILL.md` (1 exemplo), `.claude/hooks/suggest-skills.cjs`, `.claude/hooks/check-claude-md-size.cjs`

**Files:**
- Create: `.claude/skills/{tauri-2,ai-elements,cloud-run,firecrawl,data-catalog,tenancy,agents-contract,monorepo}/SKILL.md` — cada um ≤ 40 linhas, só ponteiro para o contexto
- Create/Modify: rules path-scoped em `.claude/rules/` para `apps/desktop/**` (tauri) e `packages/contracts/**` (data-catalog), apontando para `.contexts`
- Modify: `CLAUDE.md` (novas skills; ADRs 0006–0013), hook `suggest-skills` (gatilhos novos), `decisions/README.md` (índice 0006–0013)

- [ ] Follow-ups de revisões anteriores: `stacks/testing/vitest.md` → `resolve.tsconfigPaths` nativo (Vite 8) no lugar de `vite-tsconfig-paths` (review Task 3); pins antigos nas skills `next-16`, `react-19`, `vercel-ai-sdk`, `using-ddc`, `writing-plans-ddc` (review Task 1)
- [ ] Steps: read → skills → rules → CLAUDE/hook → rodar hook `check-claude-md-size` → verify → ledger → commit `chore(harness): sync claude skills and rules with core doctrine`

**Verify:** comum + `ls .claude/skills | wc -l` aumentou 8; hook de tamanho sem aviso.

---

## Self-review

- Spec §12 (ADRs, criar, atualizar, remover) → Tasks 1–10 cobrem todos os itens. "Remover: nada" → Task 7 marca deployer Vercel como não usado.
- Versões do header medidas em 2026-09-29; Next 16.3.7 e `ai` 7.0.122 sobem por política (ADR 0004 §1).
- Sem placeholders.
