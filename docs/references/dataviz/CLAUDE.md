# Projeto sob DDC Framework v1.1.1

## Norte estratégico (sempre-ativo)
@.contexts/business/vision.md
@.contexts/business/glossary.md
@.contexts/business/compliance.md

## Produto (sempre-ativo)
@.contexts/product/vision.md
@.contexts/product/tone-of-voice.md
@.contexts/product/design-system.md
@.contexts/product/persona.md

## Rules sempre-ativas
As rules em `.claude/rules/` sem `paths` carregam automaticamente em todo turn:
security, validation, error-handling, observability, migration, data-modeling,
testing, api-design, grounding, schemas, ai-friendly-code, git, commits, environments.

Rules path-scoped (development, documentation, governance, performance,
accessibility, state-management, caching, internationalization) carregam quando
o arquivo trabalhado bate o glob.

## Skills (descoberta por demanda — names = basename do arquivo)
- **Architecture** (`.claude/skills/architecture/`): fsd, feature-based, atomic-design, hexagonal, ddd, clean-architecture
- **Practices** (`.claude/skills/practices/`): tdd, bdd, sdd, clean-code, **verification-before-completion** *(ai-friendly-code virou rule)*
- **Stacks** (`.claude/skills/<categoria>/`): node-24, typescript-7, next-16, react-19, tailwind-4, shadcn-ui, radix-ui, zod-4, zustand-5, openai, anthropic, gemini, openai-sdk, anthropic-sdk, google-genai-sdk, vercel-ai-sdk, mastra-sdk, harness-engineering, firebase-functions, vitest, playwright, **database-firebase-firestore, database-postgres, database-pgvector, database-bigquery** *(prefixo por colisão com contracts)*
- **Contracts** (`.claude/skills/contracts/`): api, events, secrets, **contracts-firebase-firestore, contracts-postgres, contracts-pgvector, contracts-bigquery** *(schemas virou rule)*
- **Processes** (`.claude/skills/processes/`): **using-ddc** *(bootstrap)*, **writing-plans-ddc** *(planos + briefs)*, deploy, release, monitoring, rollback, pull-requests *(environments, git, commits viraram rule)*
- **Business** (`.claude/skills/business/`): business-model, metrics, icp *(rebaixados do CLAUDE.md)*
- **Product** (`.claude/skills/product/`): policies *(design-system e persona subiram para CLAUDE.md)*
- **Decisions** (`.claude/skills/decisions/`): decisions

## Agents
tech-lead, full-stack, backend, frontend, data-architect, qa, code-reviewer, devops,
ddc-engineering, claude-engineering, claude-agents, claude-rules, claude-skills, claude-hooks.
Cada um declara suas skills preload e contextos always-read em `.claude/agents/`.

## Hooks
Configurados em `.claude/settings.json`:
- **session-start-announce** (SessionStart + PreCompact) — **using-ddc** + catálogo + tail do progress ledger
- **suggest-skills** (PostToolUse Edit/Write + UserPromptSubmit) — skills e `@.contexts`
- **guard-conventional-commit** (PreToolUse Bash/PowerShell `git commit*`)
- **check-claude-md-size** + **grounding-warn** (Stop)

## Princípio operacional
Não duplique nada. Sempre referencie via `@.contexts/...`. Atualize o `.contexts/`
como single source of truth; `.claude/` apenas operacionaliza.

**Bootstrap:** SessionStart carrega `using-ddc`. Fluxo multi-step: `writing-plans-ddc`
→ implementer/reviewer briefs → ledger `.claude/agent-memory/progress.md` →
`verification-before-completion` antes de claim de done.

**ADR (baseline + harness):** `@.contexts/engineering/decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`

---

# dataviz — contexto específico do projeto

O bloco acima é o harness DDC (convenções compartilhadas). O que segue é
específico DESTE produto e não vive no `.contexts/`.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Dev server with Turbopack — porta 3005 (fixa no script)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Vitest (suíte completa) — rode antes de dar algo por pronto
pnpm exec tsc --noEmit   # Typecheck (o build do Next não cobre arquivos de teste)
pnpm start        # Start production server
```

Package manager: **pnpm** (v10.32.1). Do not use npm or yarn.

## Architectural Source of Truth

**Antes de implementar features ou modificar arquitetura, consulte `adrs/decisions/`.**
ADRs **0001-0018** (formato Nygard, PT-BR) são a fonte canônica: stack runtime
LLM, multi-tenancy, memória/RAG, BQML, gating de tools, hierarquia de reuso de
SQL, evals, TTL/PII de semantic recall, reranking, storage Firestore, camada
semântica (0015), AI Studio data-driven (0016/0017) e tenancy por usuário
(0018). ADR é imutável após `Accepted` — mudança vai em ADR nova com
`supersedes:`.

⚠️ Nem toda ADR em vigor está `Accepted`: **0015 e 0018 estão `Proposed`** e
mesmo assim governam código em produção (a 0015 é o fluxo `recipe → contract →
binding` descrito abaixo). Confira o `status:` no cabeçalho antes de citar uma
ADR como decidida.

- **ADR-0013 supersede ADR-0004**: Postgres + pgvector foi descontinuado.
  Storage canônico para configuração, metadados, memória de IA e
  embeddings é Firestore.
- **ADR-0019 supersede ADR-0014**: registra o estado real do runtime Mastra —
  supervisão multi-agente pela chave `agents:`, memória em serviço Firestore
  próprio (`src/shared/lib/memory/memory-service.ts`, NÃO `@mastra/memory`), e
  `@mastra/rag`/`evals`/`mcp` não adotados. A errata que ficava aqui virou ADR:
  `CLAUDE.md` é contexto de todo turn, não lugar de corrigir decisão.

- **ADR-0020**: assistente único. O supervisor de `/api/chat` ganhou as tools de
  autoria (`tools:`, ao lado de `agents:`), e a pilha paralela de canvas foi
  aposentada — `/api/canvas-chat`, o orquestrador próprio, a rota `/explore` e
  o `ChatPanel`. Não existe mais "chat de edição" separado: `ChatContent` monta
  sempre a `AISidebar`.

Specs de implementação em `docs/superpowers/specs/` referenciam ADRs aceitas;
em caso de divergência **a ADR vence**. Índice e processo em `adrs/README.md`.

## Storage

- **Firestore** (`getDb()` em `src/shared/lib/firebase/admin.ts`) para
  configuração, metadados, memória de IA, catálogo SQL, eval runs,
  judge drift e embeddings (com brute-force cosine via
  `src/shared/lib/firestore/vector-search.ts`). Coleções principais:
  `workingMemory`, `embeddingsDocs`, `embeddingsSql`, `embeddingsBlocks`,
  `sqlCatalog`, `sqlCatalogEvents`, `evalRuns`, `judgeDrift`.
- **BigQuery** permanece exclusivamente para datasets de cliente
  (carteira/contratos/pagamentos), via `src/shared/lib/bigquery/`.
- **Sem Postgres / Cloud SQL** — descontinuado em ADR-0013.

## Architecture

**Next.js 16 App Router** dashboard for credit securitization data visualization. Multi-tenant by design, com **um tenant ativo hoje: `vila-rosa`** (fonte única em `src/shared/config/tenants.ts`; os acrônimos legados OM/BRZ/CONX/IMCASA foram removidos junto com os docs `clients/` no Firestore). BigQuery no backend, Firebase auth.

### Path Aliases

- `@/*` → `src/*`
- `@app/*` → `app/*`

### Folder Structure

- `app/` — Next.js routing. `(dashboard)/` route group wraps all protected pages via `DashboardLayout`. As páginas do produto são **relatórios dinâmicos** em `g/[groupId]/r/[reportId]`; `/dashboard` é a home que redireciona para a primeira página do cliente. As páginas fixas do Play (`/contratos`, `/pdd`, `/pricing`, …) não existem mais.
- `src/pages/*/ui/` — Page-specific UI components (each `app/(dashboard)/*/page.tsx` renders a component from here).
- `src/widgets/` — Widgets reutilizáveis: AppHeader, AppBar (usado nas telas de admin), ChatSidebar, PagesSidebar, ClientSwitcher, GlobalFilters, ChartWidget, DataTableWidget, KpiCard, FilterPanel, PageFilterBar, AISidebar.
- `src/pages/explore/ui/` — **onde vive a renderização de bloco** (`CanvasBlockRenderer`, `CanvasPanel`, `blocks/*`). A página de relatório importa de lá (`src/pages/report/ui/ReportPage.tsx`), então mexer em bloco é mexer aqui, não em `widgets/`. ⚠️ **Nome enganoso:** a rota `/explore` não existe mais (ADR-0020) — sobrou a pasta, que hoje é slice compartilhado por `report` e `admin-template-editor`. Mover para `widgets/` é dívida conhecida, não feita.
- `src/features/report-authoring/` — as 4 tools de bloco que o supervisor usa (`add`/`update`/`remove`/`move`) e `apply-tool-result.ts`, o **único** aplicador de resultado de tool no canvas. Era `canvas-orchestrator/`; o orquestrador foi aposentado na ADR-0020.
- `src/shared/hooks/` — Data fetching hooks (`useReportData`, `useReports`, `useGroups`, `useMetrics`, `useTemplates`). Não há mais hook por página: as páginas são data-driven.
- `src/shared/stores/app-store.ts` — Zustand store: cliente ativo, catálogo de `metrics`, produtos, filtros por cliente, navegação (`activeGroupId`/`activeReportId`), `editingReport`, `chatOpen`, persona/ICP, `debugMode`. Não existe registro de "indicators".
- `src/shared/providers/DataProvider.tsx` — React Context for filter state (date range, projetos, advanced filters, comparison).
- `src/shared/lib/bigquery/` — cliente BigQuery e query builders.
- `src/shared/ui/` — shadcn/ui components (New York style). Config in `components.json`.
- `src/shared/config/` — `agents/` (prompts), `business-context/`, `chart-theme.ts`, `dashboard-templates/`, `glossary.ts`, `tenants.ts`. (`constants.ts` não existe mais.)
- `src/features/auth/` — Firebase authentication.

### Data Flow

Caminho semântico, 100% data-driven (`fetchBigQuery` e `/api/bigquery` foram
removidos):

1. O relatório carrega seu `blockMap` do Firestore (`dashboardTemplates/` no
   import, depois `clients/{id}/groups/{g}/reports/{r}`).
2. `useReportData` junta os `metricId` dos blocos e faz um POST em
   `/api/metrics/batch` (bloco isolado: `/api/metrics/[id]/data`).
3. O backend valida auth, resolve `metric.recipe` → `dataContract` →
   `client.productBindings` → dataset BigQuery, e executa.
4. Enforcement de rota por métrica em `metric-route-map.ts`; escopo de tenant
   é server-bound (ADR-0006).

### State Management

- **Zustand** (`app-store.ts`): client selection, indicators, filter snapshots.
- **React Context** (`DataProvider`): date range, projetos, advanced filters, comparison period.
- **No React Query/SWR** — custom `useQuery` hook with in-memory caching.

### Styling

- **Tailwind CSS v4** with OKLch color space custom theme in `globals.css`.
- **Light + Dark** via `next-themes` (`ThemeProvider` em `src/app/providers/Providers.tsx`).
  Dark é o default. Tokens semânticos (`bg-background`, `text-foreground`,
  `bg-card`, `border-border`, etc.) trocam automaticamente; cores hardcoded
  (`text-white/X`, `bg-[#hex]`) NÃO trocam — sempre prefira semantic tokens
  ou `text-foreground/X`.
- Fonts: **Geist** (sans e display) e **Geist Mono** (mono), carregadas em `app/layout.tsx`.
- Charts: **Recharts** with custom palette from `chart-theme.ts`.

### Key Libraries

- `shadcn/ui` + Radix UI primitives for components
- `Recharts` for charts
- `TanStack React Table` for data tables
- `@mastra/core` (Agent + Memory) como runtime de LLM — ADR-0014. O caminho
  AI SDK v6 direto (`features/ai-agents/orchestrator.ts` + `agents/*`) foi
  removido; o `ai` e o `@ai-sdk/google-vertex` seguem em uso para definição de
  tool (`tool()`) e para o provider do Vertex.
- `firebase` / `firebase-admin` for auth
- `puppeteer-core` + `jspdf` para export de PDF (render headless de snapshot HTML)

## Environment Variables

See `.env.example`. Key groups: GCP/BigQuery, Firebase (client + admin), Vertex AI, Firecrawl.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
