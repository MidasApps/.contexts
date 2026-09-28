# 0001. Baseline de engenharia 2026-07 e enforcement do harness DDC

- **Status:** accepted
- **Date:** 2026-07-14
- **Deciders:** projeto DDC / sessão de modernização do monorepo de contextos
- **Tags:** `engineering`, `stacks`, `harness`, `claude-code`, `ssot`, `superpowers-inspired`

## Context

O monorepo `.contexts` é a **single source of truth** do framework DDC (business, product, engineering). A camada `.claude/` apenas operacionaliza (rules, skills, agents, hooks).

Antes desta onda de mudanças, conviviam três problemas distintos:

1. **Baseline de stacks defasada ou inconsistente** entre documentos: inventário legado (ex.: Node 20, TS 5.4, Next 15, Zod 3.23 no `contexts-list`), bodies com “Next.js 15” enquanto arquivos já se chamavam `next@16`, Postgres pinado em 16 com ecossistema já em 18, Vitest 2.x com 4.x estável, paths quebrados (`zod@3.23`, `git-workflow`, `firestore.md`, etc.).

2. **Correlação entre contextos frágil**: política de PK divergente (texto dizia `uuidv7()` e exemplos ainda em ULID/TEXT), hedges “quando existir” para rules/contracts já existentes, processos com auto-referência (`deploy` “complementa” a si mesmo).

3. **Harness fraco em disciplina de processo**: `SessionStart` só injetava duas linhas de catálogo; skills de stack existiam mas o agente podia ir direto a Write sem ler `.contexts`. Havia referência a Superpowers ([obra/superpowers](https://github.com/obra/superpowers)) como modelo de bootstrap + process skills, sem copiar o produto inteiro.

Além disso, a equipe optou por **remover** o deny de `.env*` e o hook `guard-secrets` (bloqueio PreToolUse Edit|Write), reduzindo fricção local; a doutrina de secrets permanece em `@.contexts/engineering/contracts/secrets.md` e rules de security.

## Decision Drivers

1. **SSOT único:** `.contexts` manda o *quê*; `.claude` só *quando/como* operacionalizar — sem segunda doutrina.
2. **Compatibilidade mútua** da matriz de stacks (runtime ↔ language ↔ framework ↔ DB ↔ test).
3. **Grounding:** paths e versões verificáveis no disco; zero `@.contexts/...` inventado.
4. **Enforcement comportamental** (estilo Superpowers): bootstrap + process skills + evidence-before-done, sem dependência de plugin externo.
5. **Windows-first** no harness (hooks Node `.cjs`, sem scripts bash obrigatórios).
6. **Rastreabilidade:** decisões de baseline e harness documentadas e linkáveis.
7. **Operabilidade:** menos bloqueios silenciosos (`.env`) quando a política de secrets já está em contrato/rule.

## Considered Options

### A. Baseline de stacks

1. **Manter docs como estavam** e corrigir só o `contexts-list`.
2. **Atualizar cada stack isoladamente** sem matriz de compatibilidade.
3. **Congelar uma matriz pinada** (MEMORY) e alinhar stacks, contracts, rules e skills numa onda coerente.

### B. Política de identificadores (Postgres / eventos)

1. **ULID TEXT em tudo** (status quo dos exemplos legados).
2. **uuidv7() em entidades Postgres + ULID em eventId/wire** (store-specific).
3. **UUID v4 em tudo**.

### C. Harness / respeito a `.contexts`

1. **Só rules always-on** (status quo) — confiança no modelo.
2. **Instalar o plugin Superpowers “cru”** junto do DDC.
3. **Adaptar a lógica Superpowers ao DDC:** skill `using-ddc` + bootstrap SessionStart, process skills (`writing-plans-ddc`, `verification-before-completion`), ledger, hooks de sugestão/aviso — **sem** segunda SSOT `docs/superpowers/`.

### D. Proteção de secrets no Claude Code

1. **Manter** `permissions.deny` em `.env*` + hook `guard-secrets`.
2. **Remover** deny e hook; confiar em contracts/rules + disciplina humana/git.
3. **Só deny de Read**, mantendo Edit/Write bloqueados.

### E. Granularidade de ADRs

1. Vários ADRs atômicos (um por stack major).
2. **Um ADR de onda** cobrindo baseline + coerência + harness + secrets tooling, com inventário completo.

## Decision Outcome

**Escolhido: A3 + B2 + C3 + D2 + E2.**

Uma onda coordenada (2026-07) que:

1. **Fixa a matriz de produção** em `engineering/MEMORY.md` e atualiza stacks/contracts/rules/skills para ela.
2. **Padroniza IDs:** entidades Postgres (e schema `ai.*` / pgvector) com `uuid DEFAULT uuidv7()`; **eventId** e dedup/outbox de eventos permanecem **ULID** (wire cross-store).
3. **Instala enforcement de harness DDC** inspirado em Superpowers, nativo em `.claude/`.
4. **Remove** tooling de bloqueio de `.env` / `guard-secrets` do settings.
5. **Documenta tudo neste ADR `0001`** (primeira ADR do repositório de decisões).

### Matriz de baseline aceita (produção)

| Camada | Baseline | Notas |
|---|---|---|
| Runtime | **Node.js 24 LTS** (Krypton, pin ~24.18) | Node 26 = Current — não produção até LTS |
| Language | **TypeScript 7.x** | Side-by-side com API TS 6 (`@typescript/typescript6`) se eslint/Volar exigir |
| App | **Next.js 16.2.x** + **React 19.2.x** | 16.3 Instant Navigations = preview até stable |
| UI | Tailwind 4 + shadcn/ui + Radix | — |
| Validation | **Zod 4.4.x** | Sem misturar Zod 3 no mesmo bundle |
| State client | Zustand 5 | — |
| Serverless | **firebase-functions@7** + Admin **≥13**, runtime **nodejs24** | Gen 2 only |
| OLTP | **PostgreSQL 18** + Drizzle | PK default `uuidv7()` |
| Vectors | **pgvector 0.8.x** em PG 18 | HNSW default |
| Unit/integration | **Vitest 4.x** | Vite ≥6; browser via `@vitest/browser-playwright` |
| E2E | **Playwright 1.61.x** | — |
| AI default | Vercel AI SDK (cross-provider) | SDKs oficiais para feature exclusiva |

**Arquivo canônico de stack TS:** `stacks/language/typescript@7.md` (substitui `typescript@6.md`).  
**Skill operacional TS:** `typescript-7` (pasta `.claude/skills/language/typescript-7/`).

### Política de IDs (detalhe)

| Superfície | Identificador | Documento |
|---|---|---|
| Entidades Postgres | `uuid PRIMARY KEY DEFAULT uuidv7()` | `contracts/postgres.md`, `rules/data-modeling.md` |
| Schema `ai.*` (pgvector) | `uuid` + `uuidv7()` | `contracts/pgvector.md` |
| Event envelope `eventId` | **ULID** string (dedup key) | `contracts/events.md` |
| Outbox / `processed_events` | `TEXT` = eventId ULID | postgres + events |
| Firestore document IDs | ULID textual (inalterado) | `contracts/firebase-firestore.md` |

Não misturar ULID e UUIDv7 como PK no **mesmo** bounded context sem ADR futuro.

### Harness DDC (inventário do que passou a existir)

#### Skills de processo

| Skill | Path | Papel |
|---|---|---|
| `using-ddc` | `.claude/skills/processes/using-ddc/SKILL.md` | Bootstrap: iron laws, classificar pedido, mapear `@.contexts`, process first |
| `writing-plans-ddc` | `.claude/skills/processes/writing-plans-ddc/SKILL.md` | Planos em `docs/plans/` com Global Constraints = MEMORY + contexts por task |
| `implementer-brief` | `.../writing-plans-ddc/implementer-brief.md` | Template de dispatch de implementer |
| `task-reviewer-brief` | `.../writing-plans-ddc/task-reviewer-brief.md` | Template de review por task (spec + quality) |
| `verification-before-completion` | `.claude/skills/practices/verification-before-completion/SKILL.md` | Evidência fresca antes de claim de done |

#### Hooks (`.claude/settings.json` + scripts)

| Hook | Evento | Script | Comportamento |
|---|---|---|---|
| session-start-announce | SessionStart (`startup\|resume\|clear\|compact`) + PreCompact | `session-start-announce.cjs` | Injeta **using-ddc completo** + catálogo + tail do progress ledger |
| suggest-skills | UserPromptSubmit + PostToolUse Edit\|Write | `suggest-skills.cjs` | Sugere skills **e** paths `@.contexts` (typescript-7, api, plans, etc.) |
| guard-conventional-commit | PreToolUse Bash `git commit*` | `guard-conventional-commit.cjs` | Mantido |
| check-claude-md-size | Stop | `check-claude-md-size.cjs` | Aviso se CLAUDE.md > 200 linhas |
| grounding-warn | Stop | `grounding-warn.cjs` | Aviso se Write em app sem sinal de Read em `.contexts` |

**Removidos:**

- `permissions.deny`: `Read/Edit/Write(./.env*)`
- Hook PreToolUse Edit|Write → `guard-secrets.cjs` (arquivo apagado)

#### Agent memory / planos

- Ledger: `.claude/agent-memory/progress.md` (append-only; SessionStart injeta últimas entradas datadas)
- Planos efêmeros: `docs/plans/YYYY-MM-DD-<feature>.md` (não SSOT)
- Referência Superpowers (clone sem `.git`): `docs/references/superpowers/`
- Proposta de mapeamento: `docs/references/superpowers-to-ddc-proposal.md`

#### Agents atualizados (process first)

- `backend`: skills preload `using-ddc`, `verification-before-completion`; always-read MEMORY + api + events
- `full-stack`: skills preload `using-ddc`, `verification-before-completion`, `writing-plans-ddc`; always-read MEMORY

#### Documentação operacional atualizada

- `CLAUDE.md` — lista using-ddc, writing-plans-ddc, verification, hooks
- `ddc-builder.md` — bootstrap e hooks alinhados (sem guard-secrets)
- `contexts-list.md` — pins de inventário (Node 24, TS 7, Next 16, Zod 4.4, PG 18)
- `engineering/MEMORY.md` — matriz de compatibilidade + índice

### Coerência e paths (inventário de correções)

Paths legados normalizados (não exaustivo de cada linha, mas cobertura da onda):

| Antes (quebrado/legado) | Depois (canônico) |
|---|---|
| `stacks/validation/zod@3.23.md` | `zod@4.md` |
| `stacks/runtime/typescript@5.4.md` | `stacks/language/typescript@7.md` |
| `stacks/runtime/node@20.md` | `stacks/runtime/node@24.md` |
| `contracts/firestore.md` | `contracts/firebase-firestore.md` |
| `contracts/domain-events.md` / `eventos-de-dominio.md` | `contracts/events.md` |
| `processes/git-workflow.md` | `processes/git.md` |
| `processes/testing.md` | `processes/deploy.md` + `pull-requests.md` |
| `stacks/backend/firebase-firestore.md` | `stacks/database/firebase-firestore.md` |

Também: remoção de hedges “quando existir” / “contrato pendente” para artefatos já existentes; limpeza de auto-refs e duplicatas em `processes/deploy`, `pull-requests`, `environments`, `release`; exemplos DDL Postgres/pgvector alinhados a `uuidv7()`.

### Stacks e versões (lista de arquivos de stack tocados na onda)

Inclui frontmatter `last_updated` / versão e/ou conteúdo de migração:

- `stacks/runtime/node@24.md`
- `stacks/language/typescript@7.md` (**novo** no lugar de `@6`)
- `stacks/frontend/next@16.md` (16.2 / 16.3 Instant Navigations)
- `stacks/frontend/react@19.md` (19.2.x)
- `stacks/validation/zod@4.md` (4.4.x)
- `stacks/testing/vitest.md` (4.x)
- `stacks/testing/playwright.md` (1.61.x)
- `stacks/backend/firebase-functions.md` (v7 / nodejs24)
- `stacks/database/postgres.md` (18.x)
- `stacks/database/pgvector.md` (0.8.x)
- Demais stacks com cross-refs Next 15→16 / typescript@6→@7 / last_updated (AI, radix, zustand, firestore, bigquery, etc.)

Contracts/rules de modelagem alinhados: `contracts/postgres.md`, `contracts/pgvector.md`, `contracts/events.md`, `rules/data-modeling.md`, e rules com path fix listados na seção de coerência.

## Pros and Cons of the Options

### A3 — Matriz pinada + onda coerente

- **Bom:** um agente e um humano leem a mesma verdade em MEMORY e nos stacks.
- **Bom:** evita “Next 16 no nome, Next 15 no body”.
- **Ruim:** custo de revisão grande de uma vez; exige re-auditoria periódica.

### B2 — uuidv7 entidades / ULID eventos

- **Bom:** ordenação B-tree nativa no PG 18; wire UUID padrão para drivers/Drizzle.
- **Bom:** eventId ULID permanece estável para dedup multi-store.
- **Ruim:** dois formatos no ecossistema — exige disciplina por bounded context.

### C3 — Harness DDC superpowers-inspired

- **Bom:** bootstrap força o SSOT sem copiar Superpowers; process skills + ledger combatem amnésia pós-compact.
- **Bom:** Windows-friendly (Node hooks).
- **Ruim:** SessionStart carrega ~6k+ tokens do using-ddc a cada sessão/compact.
- **Ruim:** grounding-warn é heurístico (payload Stop pode não trazer tool history).

### D2 — Remover deny .env + guard-secrets

- **Bom:** menos fricção em dev; settings mais simples.
- **Ruim:** Claude Code pode ler/escrever `.env` se pedido; mitigações = gitignore, contracts/secrets, code review, não commitar secrets.

### E2 — Um ADR de onda

- **Bom:** primeira ADR conta a história completa e linkável.
- **Ruim:** arquivo longo; mudanças futuras de um único pin devem ser ADRs menores superseding partes se necessário.

## Consequences

### Positivas

- Baseline de engenharia **explícita, datada e compatível**.
- Harness **obriga** (via bootstrap + skills + avisos) o respeito a `.contexts` antes de implementar.
- IDs Postgres e pgvector alinhados a PG 18 (`uuidv7`).
- Paths legados de rules corrigidos — menos alucinação de path.
- Superpowers documentado como referência em `docs/references/` sem poluir SSOT.
- Secrets: doutrina permanece; tooling de bloqueio removido de forma consciente.

### Negativas / trade-offs

- Custo de contexto no SessionStart (using-ddc + eventual ledger).
- Dois sistemas de ID (uuidv7 vs ULID) precisam de onboarding.
- Remoção de guard-secrets aumenta superfície se o humano pedir leitura de `.env`.
- Hooks de grounding/suggest são best-effort, não proof.

### Riscos

| Risco | Mitigação |
|---|---|
| Docs voltarem a divergir | MEMORY como checklist de PR; ADR futuro por major pin |
| Agente ignorar bootstrap | Red flags no using-ddc; suggest-skills; grounding-warn; code-reviewer |
| Vazamento de secret em chat | contracts/secrets, security rule, nunca commitar `.env` |
| Ledger desatualizado | Formato append-only; confiar em git log se ledger limpo |

### Follow-ups (não feitos nesta onda)

- [ ] Fase D da proposta Superpowers: brainstorming hard-gate, systematic-debugging, evals automatizados
- [ ] ADR dedicada se Instant Navigations (Next 16.3) virar default de produção
- [ ] ADR se Node 26 LTS for adotado
- [ ] Opcional: reintroduzir deny seletivo de `.env` só em ambientes CI/shared
- [ ] Sincronizar apps consumidores com os pins (package.json/engines) quando existirem fora deste monorepo de contextos

## Compliance / implementation evidence

Artefatos que **implementam** esta decisão (não reabrir sem ADR superseding):

| Área | Paths |
|---|---|
| Matriz | `.contexts/engineering/MEMORY.md` |
| Stacks | `.contexts/engineering/stacks/**` (ver lista acima) |
| Contracts/rules | `contracts/postgres|pgvector|events`, `rules/data-modeling`, path fixes em rules/* |
| Skill TS | `.claude/skills/language/typescript-7/` |
| Process skills | `.claude/skills/processes/using-ddc/`, `writing-plans-ddc/`, `practices/verification-before-completion/` |
| Hooks | `.claude/hooks/*.cjs`, `.claude/settings.json` |
| Ledger | `.claude/agent-memory/progress.md` |
| Plans | `docs/plans/` |
| Superpowers ref | `docs/references/superpowers/`, `docs/references/superpowers-to-ddc-proposal.md` |
| Ops docs | `CLAUDE.md`, `ddc-builder.md`, `contexts-list.md` |
| Agents | `.claude/agents/backend.md`, `full-stack.md` |

## References

- [obra/superpowers](https://github.com/obra/superpowers) — modelo de bootstrap e process skills
- `@.contexts/engineering/MEMORY.md`
- `@.contexts/engineering/contracts/secrets.md` — doutrina de secrets (independente do hook removido)
- `@.contexts/engineering/rules/grounding.md`
- Skill `decisions` — formato MADR

## Notes

- Este é o **primeiro** ADR em `engineering/decisions/`. Numeração recomeça em `0001`.
- Status **accepted** reflete a onda já aplicada no repositório de contextos; mudanças futuras que revertam pins ou o bootstrap devem abrir ADR `0002+` com `supersedes` parcial ou total conforme o caso.

## Amendments

Correções de conformidade que **não alteram** pins nem bootstrap — a decisão original permanece válida.

- **2026-07-22 — auditoria de conformidade (pente fino):**
  - `guard-conventional-commit`: extração do subject corrigida para mensagens multi-linha (heredoc Bash `-m "$(cat <<'EOF'…)"` bloqueava commits válidos; here-string PowerShell `-m @'…'@` passava sem validação) e cobertura estendida à tool PowerShell em `settings.json` — a tabela de harness acima ("PreToolUse Bash") fica emendada para **Bash/PowerShell**. Regex também passou a aceitar `!` de breaking change (`feat!:` / `feat(scope)!:`), que a rule `commits` declara válido e o guard rejeitava.
  - `.contexts/business/` (6 arquivos) e `.contexts/product/` (5) criados como **boilerplate `status: template`** — os imports do CLAUDE.md e as skills business/product agora resolvem; nenhum conteúdo de negócio/produto foi inventado (preenchimento segue com os times).
  - Catálogo de agents alinhado ao disco (14 agents) em `CLAUDE.md`, `session-start-announce.cjs` e `claude-agents.md`; `claude-hooks.md` atualizado (remoção de `guard-secrets` da tabela canônica conforme D2, inclusão de `grounding-warn`, reinjeção pós-compact via SessionStart(`compact`) em vez de PreCompact).
  - `MEMORY.md`: contagem de stacks 26→25; `stacks/frontend/react@19.md`: exemplo de pin 19.0.0→19.2.0 e dependência de framework Next 15→16.
  - Conformidade com a doc oficial de hooks (code.claude.com, verificada online): `suggest-skills` no UserPromptSubmit passou a emitir `hookSpecificOutput.additionalContext` (systemMessage síncrono é user-facing e não chega ao Claude) mantendo `systemMessage` para o usuário; matcher do SessionStart ganhou `fork` (novo source); `check-claude-md-size` usa `CLAUDE_PROJECT_DIR` em vez de cwd; `session-start-announce` ecoa o `hook_event_name` real.
