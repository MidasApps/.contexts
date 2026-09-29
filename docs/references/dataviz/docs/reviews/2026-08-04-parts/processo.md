# Revisão de Processo, Qualidade e Entrega — 2026-08-04

Escopo: maquinaria de processo do repositório (testes, lint/typecheck, CI, build/deploy,
versionamento, documentação, fluxo de specs) e sua aderência às convenções DDC em
`.contexts/engineering/`.

Branch analisada: `chore/limpeza-vila-rosa`. Repositório: `C:\Projetos\liquid-dataviz`.
Todos os números abaixo foram medidos nesta sessão, não herdados do briefing.

---

## Parte 1 — Inventário

### 1.1. Suíte de testes

| Métrica | Valor | Como foi medido |
|---|---|---|
| Arquivos de teste | 241 | `find app src scripts .github -name "*.test.ts*"` |
| Testes | 1420 (1415 passam, 5 falham) | `pnpm vitest run` |
| Arquivos de teste falhando | 1 (`app/api/chat/__tests__/route.test.ts`) | idem |
| Duração | 115,97 s | idem |
| Arquivos-fonte não-teste (`app/`+`src/`) | 560 | `find ... ! -name "*.test.*" ! -path "*__tests__*"` |
| Rotas de API | 39 | `find app/api -name route.ts` |
| Rotas de API com teste | 22 (56%) | `find app/api -path "*__tests__*" -name "*.test.ts"` |
| Componentes `.tsx` não-teste | 171 | `find app src -name "*.tsx" ! -name "*.test.*"` |
| Testes de componente `.tsx` | 30 (18%) | `find app src -name "*.test.tsx"` |
| Testes `.skip` / `.only` / `.todo` | 0 | `grep -rE "(it\|test\|describe)\.(skip\|only\|todo)"` |
| Diretórios `__tests__` | 47 | `find app src -type d -name __tests__` |

Distribuição por área (top 8): `src/shared/lib` 44 · `src/features/ai-agents` 37 ·
`app` 26 · `src/features/canvas-orchestrator` 20 · `src/features/ai-studio` 20 ·
`src/shared/config` 13 · `src/features/evals` 13 · `src/features/business-context` 9.

**O que a suíte cobre bem:** camada de IA (agents, orchestrator, evals, business-context),
libs compartilhadas, schemas, rotas de API críticas (users, chat, metrics, sql-catalog).

**O que a suíte NÃO cobre:**
- **E2E: inexistente.** Não há `playwright.config.*`, diretório `e2e/`, nem qualquer
  arquivo `.spec.ts`. Nenhum fluxo crítico (login, criação de página, export de PDF)
  é validado ponta-a-ponta.
- **Widgets/UI:** 30 testes `.tsx` para 171 componentes. `src/widgets/*` tem 1 arquivo
  de teste por widget na maioria dos casos (chat-sidebar 2, pages-sidebar 3, os demais 1).
- **Cobertura instrumentada:** `vitest.config.ts:27` restringe `coverage.include` a
  `['src/shared/lib/memory/**/*.ts']`. Coverage de todo o resto do repositório é
  literalmente não medida. O comentário na linha 26 admite: `// TODO: expandir após Sprint 1`.
- **17 das 39 rotas de API** sem teste.

### 1.2. Lint e typecheck

- `pnpm lint` → **falha com exit 2**. Não roda. Ver §2 (achado 1).
- `pnpm exec tsc --noEmit` → **10 erros**, em 3 arquivos, todos de teste:
  `app/api/users/__tests__/route.test.ts` (8), `app/api/users/__tests__/route-adversarial.test.ts` (1),
  `src/widgets/filter-panel/ui/__tests__/FilterPanel.test.tsx` (1).
- Não há formatter configurado (sem Prettier, sem Biome, sem `format` script em
  `package.json:6-33`).

### 1.3. CI

Conteúdo integral de `.github/`:

```
.github/workflows/agent-evals.yml
.github/workflows/__tests__/agent-evals.test.ts
```

`agent-evals.yml` tem 3 jobs: `smoke` (em PR, path-filtered a 6 diretórios de IA),
`full` (semanal) e `drift` (mensal). Usa OIDC/Workload Identity (`agent-evals.yml:46-54`),
`pnpm install --frozen-lockfile` (`:45`) e notificação Slack em falha (`:115-122`).

**Não existe nenhum workflow que rode lint, typecheck, testes ou build.** Nenhum gate de CI
cobre os outros ~95% do repositório: `agent-evals.yml:14-19` limita o trigger de PR a
`src/features/ai-agents/**`, `src/features/canvas-orchestrator/**`, `src/shared/config/agents/**`,
`src/shared/config/business-context/**`, `src/features/ai-agents/tools/**`, `src/features/evals/**`.

Além disso, o enforcement de p50 do job `smoke` faz `process.exit(0)` quando o output não
é JSON válido (`agent-evals.yml:73-79`) — na ausência de credenciais Vertex no runner, o
único gate de CI do repositório passa vazio.

### 1.4. Build e deploy

| Artefato | Conteúdo |
|---|---|
| `Dockerfile` | 3 estágios (deps/builder/runner), Node 22 alpine, pnpm 10.32.1 pinado, usuário não-root (`:76-77`), Chromium para export de PDF (`:71-72`), `HEALTHCHECK` em `/` (`:102-103`) |
| `cloudbuild.yaml` | docker build → push → `gcloud run deploy`; secrets via `--update-secrets` (`:46`); `--allow-unauthenticated`; sem canary/traffic split |
| `deploy.sh` | Script bash local: cria Artifact Registry, lê secrets do Secret Manager para build args, `docker build` + `docker push` + `gcloud run deploy` (`:85-108`) |
| `docker-compose.yml` | Setup local (não versionado até recentemente; commit `71eede3`) |

Não há pipeline automatizado de deploy: nenhum workflow do GitHub aciona `cloudbuild.yaml`,
e `deploy.sh` roda da máquina do desenvolvedor.

### 1.5. Versionamento

| Métrica | Valor |
|---|---|
| Commits totais | 911 |
| Commits de merge | 40 |
| Tags | **0** |
| Branches locais | 30 |
| Branch mais antiga | `worktree-semantic-catalog`, 2026-05-18 (78 dias) |
| Branch default | `develop` |
| PRs (todos os estados) | 49 |
| PRs abertos | 5 (o mais antigo há 14 dias) |
| Subjects Conventional Commits (últimos 200) | 177/200 (88,5%) — os 23 restantes são merge commits |
| Subjects > 72 caracteres (últimos 200) | **96/200 (48%)** |
| Subjects com ponto final | 0 |

Types em uso: `fix` 71, `feat` 55, `chore` 23, `docs` 22, `refactor` 12, `test` 8, `perf` 1.

Configurações do repositório GitHub: `allow_squash_merge: true`, `allow_merge_commit: true`,
`allow_rebase_merge: true`, `delete_branch_on_merge: false`, `default_branch: develop`.
`develop` **não tem branch protection** (`gh api .../branches/develop/protection` → HTTP 404
"Branch not protected").

### 1.6. Documentação

| Artefato | Estado |
|---|---|
| `CLAUDE.md` | Presente, bem estruturado. Desatualizado: diz "ADRs 0001-0014" mas existem 18 |
| `adrs/decisions/` | 18 ADRs sequenciais `0001`–`0018`, formato Nygard PT-BR, com `supersedes:` |
| `adrs/README.md` | Índice + processo |
| `docs/superpowers/specs/` | 50 specs |
| `docs/superpowers/plans/` | 66 planos |
| `docs/` (raiz) | ~35 artefatos mistos: `.md`, `.docx`, `.pdf`, `.csv`, `.html` |
| `README.md` na raiz | **Ausente** |
| `CHANGELOG.md` | **Ausente** |
| `.contexts/engineering/` | 73 `.md` — **não versionado no git** (0 arquivos rastreados) |

### 1.7. Fluxo de specs/planos

O fluxo `docs/superpowers/` funciona e é visível no histórico. Exemplo verificável no
header global: `e960449 docs(spec)` → `b6e947b docs(plan)` → `0c249bd refactor(store)` →
`59ff36a feat(app-header)`. Spec e plano precedem a implementação.

O mesmo vale para ADRs: `c8eeb50 docs(adr): ADR-0018 ... (a4-12 T0)` é o primeiro commit
da série a4-12, antes de T1–T7.

---

## Parte 2 — Tabela de aderência

| Área | Convenção | Aderente? | Evidência | Observação |
|---|---|---|---|---|
| **CI** | `processes/pull-requests.md:145-156` — merge só com lint, typecheck, tests, build, E2E, security scan, coverage e bundle-size verdes | ❌ | `find .github -type f` → só `agent-evals.yml` + seu teste. `agent-evals.yml:14-19` path-filtered a 6 dirs de IA | Nenhum dos 8 gates obrigatórios existe. ~95% do repo entra sem qualquer verificação automatizada |
| **CI** | `processes/deploy.md:36-43` — "PR mergeado em main → CI verde (lint, typecheck, tests, build)" como gate | ❌ | idem acima | Passo 2 do pipeline canônico não existe |
| **CI** | `rules/governance.md:95` — CI usa install determinístico (`pnpm install --frozen-lockfile`) | ✅ | `.github/workflows/agent-evals.yml:45,104,136` | |
| **CI** | `rules/governance.md:96` — auditoria de vulnerabilidades em CI, bloqueando `high`/`critical` | ❌ | Nenhum step de `pnpm audit`/Dependabot/CodeQL em `.github/` | |
| **CI** | `processes/git.md:230-231` — `gitleaks` em pre-commit **e** em CI | ❌ | Sem `.gitleaks.toml`; sem step de secret scan em `agent-evals.yml`; sem `.husky/` | |
| **CI** | `processes/deploy.md:143` — OIDC/Workload Identity Federation, sem service account keys | ✅ | `.github/workflows/agent-evals.yml:28,46-54` (`id-token: write` + `google-github-actions/auth@v2`) | Único ponto de CI que segue a convenção à risca |
| **CI** | `processes/deploy.md:45` — "falha em qualquer etapa impede progresso" | ⚠️ | `agent-evals.yml:73-79` — sem JSON no output, `process.exit(0)` com WARN | Gate se auto-desativa quando faltam credenciais no runner |
| **Lint** | `rules/code-review.md:28` — autor roda lint local antes de abrir PR | ❌ | `pnpm lint` → exit 2, `ESLint: A configuration object specifies rule "react-hooks/set-state-in-effect", but could not find plugin "react-hooks"` | Impossível cumprir: o comando não roda. Causa em `.claude/hooks/*.cjs` (achado 1) |
| **Lint** | `practices/ai-friendly-code.md:83` — formatter + lint idênticos em todo o repo, enforce em pré-commit | ❌ | Sem Prettier/Biome; sem `format` script em `package.json:6-33`; sem `.husky/` | |
| **Lint** | `eslint.config.mjs:23-33` — `react-hooks/*` de otimização como `warn`, `rules-of-hooks` como `error` | ⚠️ | `npx eslint . --ignore-pattern ".claude/**"` → `✖ 68 problems (0 errors, 68 warnings)` | A política é sensata e os 0 erros confirmam disciplina; mas só é observável contornando o bug |
| **Typecheck** | `rules/development.md:26` — `strict: true`, sem relaxar flags | ✅ | `pnpm exec tsc --noEmit` → 10 erros, todos em arquivos de teste; nenhum em código de produção | |
| **Typecheck** | `rules/testing.md:195` — falha em main é bloqueador | ❌ | 10 erros de tipo persistem: `app/api/users/__tests__/route.test.ts` (8), `route-adversarial.test.ts:31`, `FilterPanel.test.tsx:8` | Briefing dizia 3 erros; são 10 em 3 arquivos |
| **Testes** | `rules/testing.md:73-77` — troféu: muitos de integração, base unitária, poucos E2E | ⚠️ | 241 arquivos / 1420 testes, mas 0 E2E (sem `playwright.config.*`, sem `e2e/`) | Base e meio existem e são fortes; o topo do troféu está ausente |
| **Testes** | `rules/testing.md:160-166` — E2E cobrindo fluxos críticos de negócio, contra build de produção | ❌ | `ls playwright.config.* e2e/` → não existe | Login, criação de página e export de PDF não têm validação ponta-a-ponta |
| **Testes** | `rules/testing.md:103-109` — cobertura como diagnóstico, ~100% em comportamento crítico | ❌ | `vitest.config.ts:27` — `include: ['src/shared/lib/memory/**/*.ts']` | Coverage medida em 1 diretório. Auth, billing-equivalente (tenancy) e validações de boundary ficam fora da medição |
| **Testes** | `rules/testing.md:113-118` — flakiness zero; teste flaky é bug crítico | ⚠️ | Run limpo: 5 falhas em `app/api/chat/__tests__/route.test.ts` (`Test timed out in 5000ms`). Run sob carga concorrente: 9 falhas / 3 arquivos | A suíte degrada sob carga — sintoma de dependência de recurso externo, não de isolamento |
| **Testes** | `rules/testing.md:138-142` — LLM mockado no unitário; nunca chamadas reais a cada commit | ❌ | Log do run: `[chat] workflow routing falhou — usando descriptive Error: 2 UNKNOWN: Getting metadata from plugin failed with error: {"error":"invalid_grant", ..., "error_subtype":"invalid_rapt"}` | **O teste faz chamada real a GCP.** O briefing atribui as 5 falhas a "credencial ADC expirada" — correto quanto à causa proximal, mas a causa raiz é o teste não ser hermético |
| **Testes** | `rules/testing.md:64-69` — determinismo: mesmo input, mesmo resultado em qualquer máquina | ❌ | idem acima — resultado depende do estado de `gcloud auth application-default` da máquina | Viola diretamente "Nunca dependa de … sem default seguro — quebra na máquina do colega" (`:206`) |
| **Testes** | `rules/testing.md:208` — sem `.only`/`.skip` em main | ✅ | `grep -rE "(it\|test\|describe)\.(skip\|only\|todo)" app src` → 0 | |
| **Testes** | `rules/testing.md:178-181` — teste próximo do código; sem pasta `tests/` espelhando `src/` | ✅ | 47 diretórios `__tests__` co-localizados; sem `tests/` na raiz | |
| **Testes** | `rules/testing.md:170` — suíte de PR abaixo de 2 min | ⚠️ | `Duration 115.97s` | Dentro do alvo, mas sem margem — e sem CI que a execute |
| **Testes** | `rules/testing.md:122-124` — route handlers testados no boundary, com caminhos 400/404/401/403 | ⚠️ | 22 de 39 rotas com teste (`find app/api -path "*__tests__*"`) | Onde existe, a disciplina é boa (ex.: `route-adversarial.test.ts` para RBAC); 17 rotas sem nenhum teste |
| **TDD** | `practices/tdd.md:230` — commits de teste precedem commits de produção | ⚠️ | `cf4b61d test(users): suíte adversarial V1-V6 do RBAC clientAdmin (gate de merge) (a4-12 T7)` vem **depois** de T1–T6 de implementação | 8 commits `test:` em 200. O padrão dominante é teste junto/depois, não antes |
| **TDD** | `practices/tdd.md:106` — bugfix começa por teste que reproduz o bug | ⚠️ | 71 commits `fix:` em 200; nenhum par `test:`→`fix:` observável no histórico recente | Testes acompanham os fixes no mesmo commit, o que satisfaz `rules/testing` mas não o ciclo Red-Green |
| **BDD** | `practices/bdd.md:184-189` — aplicar só com stakeholder de negócio engajado e time cross-functional | n/a | Sem Gherkin, sem `.feature`, sem Cucumber no repositório | Ausência é **correta**: `practices/bdd.md:199` desaconselha BDD em time onde dev e PM se sobrepõem. Não é gap |
| **BDD** | `practices/bdd.md:246-254` — BDD-style em Vitest (`describe`/`it` comportamental) quando o público é técnico | ✅ | Nomes como `'degrades gracefully when resolver returns null (still 200, no semanticContext)'`, `'passes body.clientId as the 3rd arg to verifyDatasetAccess (cross-tenant guard)'` | Nomes descrevem comportamento, não implementação — conforme `rules/testing.md:48-51` |
| **SDD** | `practices/sdd.md:116` — spec antes do código, sempre | ✅ | `e960449 docs(spec)` → `b6e947b docs(plan)` → `59ff36a feat(app-header)`; 50 specs + 66 planos em `docs/superpowers/` | Prática mais bem executada do repositório |
| **SDD** | `practices/sdd.md:96` — spec tem Acceptance Criteria verificáveis | ✅ | `docs/superpowers/specs/2026-07-21-a4-12-provisionamento-design.md`, `plans/2026-07-21-a4-12-provisionamento.md` seguem o formato faseado | |
| **SDD** | `practices/sdd.md:117` — spec versionada em git, com PR e histórico | ⚠️ | Specs estão em git; mas `git status` mostra 4 specs/planos recentes ainda **não commitados** | Deriva pequena e recuperável |
| **SDD** | `practices/sdd.md:203` — schema Zod antes da rota que o consome | ✅ | `src/shared/schemas/` com 6 arquivos de teste; validação Zod nas rotas | |
| **Clean Code** | `practices/clean-code.md:226` — sem comentário que repete o nome do método | ✅ | Amostragem em `Dockerfile:67-70`, `vitest.config.ts:11-13`, `eslint.config.mjs:22-26`: comentários explicam **porquê** (ex.: "sem isto, findChrome() … falha em runtime — o build passa, então o problema só aparece em produção") | Densidade e tom de comentário são um ponto forte real |
| **Clean Code** | `rules/development.md:20` — nunca usar `any` | ✅ | `grep -rnE ":\s*any\b\|<any>\|as any"` em `app`+`src` não-teste → **4** ocorrências | |
| **Clean Code** | `rules/development.md:21` — nunca `@ts-ignore` | ✅ | `grep -rn "@ts-ignore" app src` → **0** | |
| **Clean Code** | `rules/development.md:92` — nunca `console.log` em produção; usar logger estruturado | ⚠️ | 14 ocorrências. Legítimas: `src/shared/lib/telemetry/record-span.ts:14,26`, `metrics.ts:17` (logger estruturado JSON), `run-evals.ts:238` (CLI). Violações: `src/shared/hooks/useClients.ts:19,20,27,79,88,96` (6 logs de debug) | |
| **Clean Code** | `rules/development.md:87` — `TODO` com dono e issue: `// TODO(@usuario,#123)` | ⚠️ | 11 TODOs, todos no formato `// TODO(sprint-3): …` — ex.: `src/features/canvas-orchestrator/steps/gather-context-step.ts:37,47,57,67,77` | Tem escopo temporal, mas não tem dono nem issue rastreável |
| **AI-friendly** | `practices/ai-friendly-code.md:36` — arquivos acima de 1000 linhas são anti-pattern | ⚠️ | 3 arquivos: `src/pages/explore/ui/ConversationSidebar.tsx` (1201), `src/pages/docs/ui/docs-data.ts` (1197), `src/shared/config/indicator-suggestions.ts` (1153) | 9 arquivos acima de 500 linhas em 560. Os dois últimos são tabelas de dados, onde o custo é menor |
| **AI-friendly** | `practices/ai-friendly-code.md:78` — path aliases consistentes | ✅ | `@/*`→`src/*`, `@app/*`→`app/*` em `CLAUDE.md` e `vitest.config.ts:8-15` | |
| **AI-friendly** | `practices/ai-friendly-code.md:63` — localidade semântica; teste a 1 hop do código | ✅ | 47 `__tests__` co-localizados por feature | |
| **AI-friendly** | `practices/ai-friendly-code.md:273` — file size p95 monitorado em CI; complexidade ciclomática capped | ❌ | Nenhum step de métrica em `.github/` | |
| **Commits** | `processes/commits.md:11` — Conventional Commits enforce via Commitlint (Husky) + Action de título de PR | ❌ | `commitlint.config.js` **ausente**; `.husky/` **ausente**; nenhuma Action de validação de título em `.github/workflows/` | Zero enforcement automatizado |
| **Commits** | `processes/commits.md:18` — estrutura `<type>(<scope>): <subject>` | ✅ | 177/200 subjects conformes (`git log --pretty=%s -200`); os 23 restantes são merge commits | Disciplina manual é boa |
| **Commits** | `processes/commits.md:73` + `:231` — header ≤ 72 caracteres | ❌ | **96 de 200** subjects excedem 72 caracteres. Maior: 125 (`fix(rbac): email imutavel em doc existente fecha colisao de slug + protege campos globais cross-tenant (a4-12 review final 2)`) | 48% de violação. Um `commitlint` com `header-max-length: 72` (`commits.md:190`) pegaria todos |
| **Commits** | `processes/commits.md:71` — sem ponto final no subject | ✅ | `git log --pretty=%s -200 \| grep -c '\.$'` → 0 | |
| **Commits** | `processes/commits.md:51-54` — scope em kebab-case, um nível, sem scopes genéricos | ✅ | `feat(pages-sidebar)`, `fix(filter-panel)`, `chore(docker)`, `fix(rbac)` | |
| **Commits** | `processes/commits.md:235` — proibida coexistência de commits Conventional e livres no mesmo repo | ⚠️ | `b7152d5 merge: WS-4 IA batch1 …` usa type `merge`, que não existe na tabela de `commits.md:33-45` | Caso isolado |
| **Commits** | `processes/commits.md:213-219` — trailer `Co-Authored-By:` em mensagem assistida por IA | ✅ | `git log --format=%b -50 \| grep -c Co-Authored-By` → 32. Formato: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (29), Sonnet 5 (2), Opus 4.8 (1) | Transparência de autoria assistida exigida por `rules/governance` está cumprida, com o modelo identificado |
| **Git** | `processes/git.md:9-14` — Trunk-Based com `main`; **"Git Flow é rejeitado: overhead de `develop`…"** | ❌ | `default_branch: develop` (`gh api repos/:owner/:repo`); `git branch` mostra `develop` como trunk | Divergência estrutural entre a convenção e o repositório |
| **Git** | `processes/git.md:53-60` — `main` protegida: sem direct push, PR obrigatório, status checks verdes, force push proibido | ❌ | `gh api repos/:owner/:repo/branches/develop/protection` → **HTTP 404 "Branch not protected"** | Nenhuma das 7 regras de proteção está ativa |
| **Git** | `processes/git.md:22` — branch `<type>/<short-description>` em kebab-case | ⚠️ | 26 de 30 branches conformes. Fora do padrão: `worktree-semantic-catalog`, `drought-dust-devil`, `kit-fox-cottontail`, `luminaria-hogback`, `saddle-ristra` | As 4 últimas parecem nomes gerados automaticamente (worktrees) |
| **Git** | `processes/git.md:12` + `:327` — feature branches vivem horas a poucos dias; >1 semana sem rebase é anti-pattern | ❌ | `git for-each-ref --sort=committerdate refs/heads/`: 19 branches com último commit anterior a 2026-06-25 (40+ dias). Mais antiga: `worktree-semantic-catalog` 2026-05-18 (78 dias) | |
| **Git** | `processes/git.md:100-105` — squash merge como default; `merge --no-ff` em todo merge é anti-pattern | ❌ | 40 merge commits (`git rev-list --count --merges HEAD`), com títulos `Merge pull request #NN from …` | Merge commit é o padrão de facto, não squash |
| **Git** | `processes/git.md:148-151` — releases marcadas com tags anotadas semver `vX.Y.Z` | ❌ | `git tag \| wc -l` → **0** | Nenhuma release rastreável em 911 commits |
| **Git** | `processes/git.md:79` + `pull-requests.md:269` — branches remotas deletadas automaticamente pós-merge | ❌ | `delete_branch_on_merge: false` (`gh api repos/:owner/:repo`) | |
| **Git** | `processes/git.md:206-214` — `.gitattributes` commitado na raiz com normalização `eol=lf` | ❌ | `test -e .gitattributes` → MISSING | Relevante: o time desenvolve em Windows e faz deploy em alpine |
| **Git** | `processes/git.md:163-200` — `.gitignore` cobrindo env, deps, build, coverage, logs, IDE, OS | ✅ | `.gitignore:2,6,10,11,39,41,42` — `node_modules/`, `.next/`, `.env.local`, `.env*.local`, `secrets/*`, `.env`, `.env.docker` | |
| **Git** | `processes/git.md:228` + `rules/governance.md:153` — nunca commitar segredos | ✅ | `git ls-files \| grep -E "^\.env"` → só `.env.example`, `.env.docker.example`, `.env.local.example`. `secrets/` contém apenas `.gitkeep` (instruções, sem chaves) | |
| **PRs** | `rules/code-review.md:61` — **"Sempre exija pelo menos uma aprovação humana antes do merge, mesmo em PR gerado por IA"** | ❌ | Análise dos 49 PRs via `gh pr list --json reviews`: **0 PRs com review humana APPROVED**. 32 com **zero** reviews. 17 com review apenas do bot `amazon-q-developer`, sempre `COMMENTED`, nunca `APPROVED` | Gate mais importante do framework, 0% de aderência |
| **PRs** | `processes/pull-requests.md:36` + `rules/code-review.md:63` — 2 approvals em auth/autorização/migrations/CI | ❌ | PR #46 (`feat(a4-12): provisionamento self-service + tenancy multi-cliente + papel clientAdmin`) — RBAC e autorização — tem 0 reviews | |
| **PRs** | `processes/pull-requests.md:20-21` — alvo < 400 LOC; **limite duro 800 LOC** | ❌ | **31 dos 49 PRs** excedem 800 linhas alteradas. Extremos: PR #45 (+8795/-41), PR #44 (+7902/-41), PR #48 (+3220/-617), PR #49 (+2578/-608) | |
| **PRs** | `processes/pull-requests.md:63` — `.github/pull_request_template.md` | ❌ | `test -e .github/pull_request_template.md` → MISSING (e `PULL_REQUEST_TEMPLATE.md` também) | |
| **PRs** | `processes/pull-requests.md:114` + `rules/governance.md:24` — `CODEOWNERS` cobrindo auth, schema, prompts de IA, CI | ❌ | `test -e .github/CODEOWNERS` → MISSING | |
| **PRs** | `processes/pull-requests.md:44` — título do PR em Conventional Commits | ✅ | `gh pr list`: `feat(nav): header global com cliente, filtros e chat`, `refactor(api): realoca filter_options …`, `fix(dod1): destrava cliente externo ponta-a-ponta …` | |
| **PRs** | `processes/pull-requests.md:66-92` — descrição com Summary/Changes/Why/How to test/Risks/Checklist | ⚠️ | PR #44 tem `## Resumo` substantivo com fases e veredito; mas o template canônico não existe para padronizar | Qualidade depende do autor |
| **PRs** | `processes/pull-requests.md:193` + `rules/code-review.md:73` — idade máxima sem update: 7 dias | ❌ | PRs abertos: #45 há 14 dias, #46 há 13, #47 há 13 | 3 de 5 PRs abertos violam o SLA |
| **PRs** | `processes/git.md:55` — "Sem direct push. Qualquer commit chega via PR" | ❌ | PR #46 está **OPEN**, `mergedAt: null`, base `feat/dod1-cliente-externo-remediacao` — e **13 de 13 commits já estão em `origin/develop`** (`git merge-base --is-ancestor`) | O código chegou ao trunk fora do PR. O PR virou artefato vestigial |
| **PRs** | `processes/pull-requests.md:229-235` — PR que altera prompt de IA roda eval suite antes do merge, com before/after | ⚠️ | `agent-evals.yml:31-32` roda `smoke` em PR quando toca dirs de IA — mas com `--dry-run` (`:63`) e enforcement que se auto-desativa (`:73-79`) | O mecanismo existe; a garantia, não |
| **Code review** | `rules/code-review.md:48` — taxonomia `blocker:`/`issue:`/`suggestion:`/`nit:`/`question:`/`praise:` | ⚠️ | Reviews do `amazon-q-developer` usam "Critical Issues (Must Fix)" / "Positive Observations"; commits de resposta a review existem e são rastreáveis (`8020286 fix(rbac): … (a4-12 T3 review)`, `ad5d814 … (a4-12 T2 review)`) | Há cultura de review; falta o vocabulário padronizado e a aprovação formal |
| **Code review** | `rules/code-review.md:98` — nunca aprovar PR que adiciona segredo | ✅ | Nenhum `.env` real rastreado; `secrets/` só com `.gitkeep` | |
| **Code review** | `rules/code-review.md:106` — PRs gerados por IA marcados com label `ai-generated` + agente/modelo no corpo | ❌ | `gh pr list --json labels` → nenhuma label em uso no repositório | |
| **Deploy** | `processes/deploy.md:13` — "pipeline executa o deploy. Humanos aprovam, não digitam comandos" | ❌ | `deploy.sh:85-108` — `docker build` + `docker push` + `gcloud run deploy` da máquina local. Nenhum workflow aciona `cloudbuild.yaml` | `deploy.md:233` classifica "deploy manual via … script ad hoc" como anti-pattern |
| **Deploy** | `processes/deploy.md:23-27` — três ambientes (`dev`/`staging`/`prod`) em projetos GCP separados | ❌ | `cloudbuild.yaml:58-60` — um único `_SERVICE: liquid-dataviz`, `_REGION: us-central1`, `_IMAGE: …:latest`. Sem substituição por ambiente | `deploy.md:45`: "Nunca pule etapas"; `environments.md:29`: "Nunca promover … sem passar por staging" |
| **Deploy** | `processes/deploy.md:98-105` + `rollback.md:232` — `/health/liveness` e `/health/readiness` em todo serviço | ❌ | `find app/api -type d \| grep -iE "health\|status"` → NONE. `Dockerfile:102-103` faz `HEALTHCHECK` em `/` | Sem readiness, o rollout não sabe se BigQuery/Firestore/Vertex responderam |
| **Deploy** | `processes/deploy.md:105` — smoke tests automáticos pós-deploy, com rollback em 5 min | ❌ | Nenhum step de smoke em `cloudbuild.yaml` nem em `deploy.sh` | |
| **Deploy** | `processes/deploy.md:90-91` — build embute `GIT_SHA` + `RELEASE_TAG`; `/health` expõe `{version, commit, builtAt}` | ❌ | `Dockerfile:37-53` só recebe `NEXT_PUBLIC_FIREBASE_*` como ARG; sem `GIT_SHA` | Impossível correlacionar erro em produção a commit |
| **Deploy** | `processes/deploy.md:82` — canary escalonado 5→25→50→100% para risco médio/alto | ❌ | `cloudbuild.yaml:31-46` — `gcloud run deploy` direto, 100% do tráfego | Cloud Run suporta `--no-traffic` + `update-traffic`; não é usado |
| **Deploy** | `processes/deploy.md:134` — GitHub Environment `production` com required reviewers | ❌ | Sem `environment:` em `.github/workflows/`; deploy nem passa pelo GitHub | |
| **Deploy** | `processes/deploy.md:144` — nunca commitar `.env`; secrets via Secret Manager | ✅ | `cloudbuild.yaml:46` — `--update-secrets=BIGQUERY_PROJECT_ID=…:latest,…` (10 secrets). `deploy.sh:78-83` lê do Secret Manager | Ponto forte |
| **Deploy** | `processes/deploy.md:246` — endpoint crítico em prod sem `minInstances` é anti-pattern | ❌ | `cloudbuild.yaml:40` — `--min-instances=0` | Cold start em toda requisição após ociosidade |
| **Deploy** | `processes/deploy.md:247` + `environments.md:250` — region pinning `southamerica-east1` para LGPD | ❌ | `cloudbuild.yaml:59` — `_REGION: 'us-central1'` | Dados de carteira de crédito de clientes brasileiros processados fora do BR. Merece decisão registrada |
| **Deploy** | `processes/deploy.md:199-206` — audit log de deploy (quem/quando/o quê/por quê) via GitHub Deployments API | ❌ | Deploy roda de máquina local via `deploy.sh`; sem registro | |
| **Release** | `processes/release.md:102-109` — toda release produz tag anotada `vX.Y.Z`; "release sem tag é inválida" | ❌ | `git tag \| wc -l` → **0** | |
| **Release** | `processes/release.md:106` + `rules/documentation.md:152` — `CHANGELOG.md` mantido | ❌ | `test -e CHANGELOG.md` → MISSING | |
| **Release** | `processes/release.md:92-94` — release automatizada em `main` via Release Please / changesets / semantic-release | ❌ | Sem `.releaserc`, `release-please-config.json`, `.changeset/` | |
| **Release** | `processes/release.md:20` — desacoplar release de deploy via feature flags | ❌ | Sem sistema de feature flags no repositório | `governance.md:129-134` exige dono, motivo e data de expiração por flag |
| **Release** | `processes/release.md:339-346` — métricas DORA (frequency, lead time, CFR, MTTR) | ❌ | Sem tags nem audit de deploy, as quatro métricas são incalculáveis | |
| **Rollback** | `processes/rollback.md:228` — "versão anterior conhecida boa, identificável por tag/release" | ❌ | 0 tags; imagem publicada como `:latest` (`cloudbuild.yaml:60`) | `rollback.md:264`: "Sem tag em prod = sem ponto de rollback identificável" |
| **Rollback** | `processes/rollback.md:79` — rollback de Cloud Run via `update-traffic --to-revisions` | ⚠️ | Mecanismo existe na plataforma (revisions do Cloud Run), mas não está documentado em runbook nem exercitado | |
| **Rollback** | `processes/rollback.md:240-243` — game day trimestral; drill de rollback cronometrado | ❌ | Sem `RUNBOOK.md` em nenhuma feature (`find . -name "RUNBOOK.md"` → nenhum) | |
| **Rollback** | `processes/rollback.md:42-46` — feature flag flip como mecanismo preferido (segundos) | ❌ | Sem feature flags | Todo bug exige redeploy |
| **Ambientes** | `processes/environments.md:130` + `rules/development.md:113` — env vars validadas por schema Zod no boot; nunca `process.env.X` espalhado | ❌ | **63 ocorrências** de `process.env` em `app`+`src` não-teste; nenhum módulo de config/schema de env (`find src app -iname "*env*.ts"` → nenhum) | |
| **Ambientes** | `processes/environments.md:301` — ausência de `.env.example` é anti-pattern | ✅ | `.env.example`, `.env.local.example`, `.env.docker.example` presentes | |
| **Ambientes** | `processes/environments.md:141` — `NODE_ENV` e `APP_ENV` distintos; nunca usar `NODE_ENV` para lógica de negócio | ⚠️ | `cloudbuild.yaml:45` seta só `NODE_ENV=production`; não há `APP_ENV` | Sem staging, a distinção ainda não mordeu — mas bloqueia a criação de staging |
| **Ambientes** | `processes/environments.md:196-208` — setup local canônico documentado e runnable | ✅ | `docs/local-dev.md` + `docker-compose.yml` + `.env.docker.example` + `secrets/.gitkeep` com instruções | Commit `71eede3 chore(docker): versiona o setup local e a proteção de segredos` |
| **Monitoring** | `processes/monitoring.md:21-32` — stack canônico (Cloud Monitoring, Sentry, OTel, Langfuse, PagerDuty) | ⚠️ | `src/shared/lib/telemetry/record-span.ts` emite spans em JSON estruturado; `docs/observability/` existe. Sem Sentry, sem OTel exporter, sem alerting | Fundação de logging estruturado existe; não há destino nem alerta |
| **Monitoring** | `processes/monitoring.md:51-64` — SLOs declarados antes do go-live | ❌ | Nenhum SLO declarado em `adrs/` ou `docs/` | |
| **Monitoring** | `processes/monitoring.md:143-154` — thresholds de alerta com severidade P1/P2/P3 | ❌ | Sem alerting configurado | |
| **Monitoring** | `processes/monitoring.md:160-164` — rotação de on-call semanal | ❌ | Sem escala publicada | `governance.md:178`: "Oncall sem escala é oncall fantasma" |
| **Monitoring** | `processes/monitoring.md:211-220` — métricas obrigatórias de IA (token usage, cost attribution, finish_reason, tool success rate) | ⚠️ | `src/features/evals/` + `app/api/admin/orchestrator-metrics` + `admin/judge-drift` + páginas `admin-agent-quality`/`admin-orchestrator-analytics` | Instrumentação de qualidade de IA é forte; falta cost/token attribution em produção |
| **Monitoring** | `processes/monitoring.md:205` — proibido PII, secrets e tokens em logs | ⚠️ | `src/shared/hooks/useClients.ts:19,27` logam `hasExtToken`/`API response` no browser | Loga booleano e status, não o token — risco baixo, mas é logging de debug em produção |
| **Documentação** | `rules/documentation.md:103-104` — `README.md` na raiz de todo app executável, com propósito/pré-requisitos/comandos | ❌ | `test -e README.md` → MISSING | `CLAUDE.md` cobre parte, mas é dirigido a agente, não a onboarding humano |
| **Documentação** | `rules/documentation.md:133-136` — decisões registradas como ADR; ADR aceito nunca editado, sempre superseded | ✅ | 18 ADRs sequenciais `0001`–`0018` em `adrs/decisions/`; `CLAUDE.md` documenta ADR-0013 supersede 0004 e ADR-0014 supersede 0002 | Prática exemplar |
| **Documentação** | `rules/governance.md:15` — ADRs numerados sequencialmente, sem pular números | ✅ | `ls adrs/decisions/` → `0001`…`0018` sem lacunas | |
| **Documentação** | `rules/governance.md:13` — ADR criado **antes** do PR de implementação | ✅ | `c8eeb50 docs(adr): ADR-0018 tenancy por-usuário como conjunto + clientAdmin (a4-12 T0)` é o primeiro commit da série a4-12 | |
| **Documentação** | `rules/documentation.md:174` — documentação desatualizada é bug | ⚠️ | `CLAUDE.md` afirma "ADRs 0001-0014 … são a fonte canônica"; existem 18 (0015–0018 não citados) | Deriva pequena, mas em arquivo lido a cada turn de agente |
| **Documentação** | `rules/documentation.md:184-187` — docs para LLM em markdown puro, com frontmatter de versão/status | ✅ | `.contexts/engineering/rules/*.md` e `practices/*.md` têm frontmatter `title/type/status/last_updated` | |
| **Documentação** | `rules/documentation.md:166` — nunca versionar diagrama PNG sem fonte ao lado | ⚠️ | 32 PNGs na raiz do repositório (screenshots de UI) — ignorados por `.gitignore:33 /*.png`, não rastreados | Não viola o git, mas é sujeira no diretório de trabalho |
| **Governança** | `.claude/rules/governance.md` — "`.contexts/…` é fonte de verdade do projeto" | ❌ | `git ls-files .contexts \| wc -l` → **0**. `.claude/hooks/` e `.claude/rules/` também untracked (`git status --porcelain`) | As convenções que governam o repositório não estão versionadas: sem PR, sem histórico, sem blame, sem owner |
| **Governança** | `rules/governance.md:26` — pelo menos dois owners por área crítica | ❌ | Sem `CODEOWNERS`; `git shortlog -sn` concentra a autoria | |
| **Governança** | `rules/governance.md:94` — lockfile commitado | ✅ | `pnpm-lock.yaml` rastreado | |
| **Governança** | `rules/governance.md:70` — PR que adiciona dependência sem nota de licença é bloqueado | ⚠️ | Nenhum PR recente documenta licença; por outro lado, o histórico mostra **remoção** disciplinada de deps não usadas (`git diff develop..HEAD -- package.json`: 9 deps removidas) | |
| **Governança** | `rules/governance.md:116` — eval obrigatório antes de mudar prompt de produção | ⚠️ | `agent-evals.yml` existe e roda em PR; mas com `--dry-run` e enforcement que se auto-desativa | Melhor cobertura de gate do repositório, ainda assim não vinculante |
| **Governança** | `rules/governance.md:123` — kill-switch funcional por feature de IA | ❌ | Sem feature flags nem kill-switch | |
| **Governança** | `rules/governance.md:107` — region pinning quando o provider suportar; default global proibido para fluxos com PII | ❌ | `cloudbuild.yaml:59` `us-central1`; `GOOGLE_VERTEX_LOCATION` vem de secret, não verificável aqui | Ver linha de Deploy/region |
| **Desenvolvimento** | `rules/development.md:19` — sempre TypeScript, sem `.js` novo em produção | ✅ | `find app src -name "*.js"` → nenhum arquivo de produção | |
| **Desenvolvimento** | `rules/development.md:25` — sem enums TypeScript | ✅ | `grep -rn "^enum\|export enum" app src` → 0 | |
| **Desenvolvimento** | `rules/development.md:32` — sem imports relativos profundos (`../../../`) | ✅ | Path aliases `@/` e `@app/` configurados e em uso | |
| **Desenvolvimento** | `rules/development.md:108` — versões exatas para libs críticas | ❌ | `package.json:38-71` — **32 de 32** dependências usam range `^`, nenhuma fixada; inclui `next`, `firebase-admin`, `@mastra/core`, `ai` | |

**Total: 117 linhas de convenção avaliadas** — 33 ✅ · 26 ⚠️ · 57 ❌ · 1 n/a.

Leitura do agregado: o repositório é forte onde a disciplina é **autoral** (ADRs, specs,
nomes de teste, tipagem, comentários que explicam o porquê, higiene de segredos) e fraco
onde a disciplina deveria ser **automatizada** (CI, branch protection, tags, health checks,
enforcement de commit e de review). Nenhum dos 57 ❌ decorre de código mal escrito; quase
todos decorrem de ausência de gate.

---

## Os 3 achados mais graves

### 1. `pnpm lint` não roda — e nenhum CI perceberia

`pnpm lint` termina com **exit 2** e zero arquivos analisados:

```
ESLint: 9.39.4
A configuration object specifies rule "react-hooks/set-state-in-effect",
but could not find plugin "react-hooks".
```

**Causa raiz.** `eslint-config-next/core-web-vitals` registra o plugin `react-hooks` num
config object escopado a `files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"]` — que **não inclui
`.cjs`**. O config object do projeto (`eslint.config.mjs:21-45`) não declara `files`, então
aplica as regras `react-hooks/*` a todo arquivo lintado, inclusive `.cjs`, onde o plugin
não está em escopo. Os arquivos `.cjs` do repositório são exatamente os hooks do harness
DDC recém-instalado:

```
.claude/hooks/check-claude-md-size.cjs
.claude/hooks/grounding-warn.cjs
.claude/hooks/guard-conventional-commit.cjs
.claude/hooks/session-start-announce.cjs
.claude/hooks/suggest-skills.cjs
```

Verificação: `npx eslint .claude/hooks/guard-conventional-commit.cjs` reproduz o erro;
`npx eslint src/shared/lib/utils.ts` passa limpo; e

```
npx eslint . --ignore-pattern ".claude/**"
→ ✖ 68 problems (0 errors, 68 warnings)
```

reproduz exatamente o baseline de 68 warnings citado no briefing. Ou seja: **a instalação do
harness quebrou o lint do produto**, e o número "0 erros / 68 warnings" só é observável
contornando o bug.

**Por que é grave:** não há workflow de CI que rode lint (`.github/` só tem `agent-evals.yml`,
path-filtered a diretórios de IA). O gate está quebrado e cego ao mesmo tempo — ninguém seria
notificado. `eslint.config.mjs` é idêntico em `develop` (`git diff develop..HEAD` não o
lista), então o problema atinge o repositório inteiro, não só esta branch.

**Correção mínima:** adicionar `'.claude/**'` ao array `ignores` de `eslint.config.mjs:8-17`
(coerente com `adrs/**`, `docs/**` e `scripts/**`, já ignorados), ou escopar o config object
do projeto com `files: ['**/*.{ts,tsx}']`.

### 2. Nenhum dos 49 PRs teve aprovação humana, e o trunk não é protegido

Medição via `gh pr list --state all --limit 60 --json reviews`:

- **0 de 49 PRs** têm review humana com estado `APPROVED`.
- **32 PRs** foram para o trunk com **zero** reviews.
- **17 PRs** têm apenas review do bot `amazon-q-developer`, sempre `COMMENTED`, nunca `APPROVED`.
- **31 de 49 PRs** excedem o limite duro de 800 LOC (`pull-requests.md:21`). PR #45: +8795/-41.

Isso viola frontalmente `rules/code-review.md:61` ("Sempre exija pelo menos uma aprovação
humana antes do merge, **mesmo em PR gerado por IA**") e `:63` (2 approvals para auth e
autorização — PR #46 é justamente RBAC/tenancy e tem 0 reviews).

O caso mais concreto do custo: em PR #44 o bot sinalizou **SQL injection em
`/api/metrics/filter-values` (CWE-89)** e risco de perda de dados em `bq-load-aux-tables.ts`,
como "5 critical defects that must be fixed before merge". Não há aprovação humana registrada
confirmando o tratamento — o rastro de que os fixes foram aplicados existe apenas na prosa do
corpo do PR.

E o gate não é contornado por descuido, é **inexistente**:

```
gh api repos/:owner/:repo/branches/develop/protection
→ HTTP 404 "Branch not protected"
```

Sem required reviews, sem required status checks, sem restrição de push. Consequência
observável: **PR #46 está `OPEN`, `mergedAt: null`, e os 13 de 13 commits já estão em
`origin/develop`** (verificado com `git merge-base --is-ancestor`). O código chegou ao trunk
por fora do PR; o PR ficou como artefato vestigial. O mesmo padrão aparece no histórico:
57 dos últimos 60 commits de first-parent em `develop` não são merges.

### 3. Zero rastreabilidade de release: sem tags, sem health checks, sem rollback

Três ausências que se compõem:

- **`git tag | wc -l` → 0**, em 911 commits. `processes/release.md:109`: "Toda release sem
  tag é inválida e deve ser tratada como deploy não-rastreado."
- **Nenhum health endpoint.** `find app/api -type d | grep -iE "health|status"` → nada.
  `Dockerfile:102-103` faz `HEALTHCHECK` em `/`, que responde 200 mesmo com BigQuery,
  Firestore ou Vertex fora do ar. `rollback.md:232` exige `/health/liveness` e
  `/health/readiness` como pré-requisito de rollback.
- **Imagem publicada como `:latest`** (`cloudbuild.yaml:60`), sem `GIT_SHA` embutido no build
  (`Dockerfile:37-53` só recebe `NEXT_PUBLIC_FIREBASE_*`).

O efeito prático é o descrito em `rollback.md:264`: *"Sem tag em prod = sem ponto de rollback
identificável. 'Qual era a versão anterior?' é pergunta que não pode existir durante
incidente."* Hoje ela existe e não tem resposta. Some-se: sem feature flags (rollback por
flag flip, o mecanismo preferido de `rollback.md:42`), sem smoke tests pós-deploy, sem
`min-instances` (`cloudbuild.yaml:40` → `--min-instances=0`), sem `CHANGELOG.md` e sem
audit de deploy — porque `deploy.sh` roda da máquina do desenvolvedor
(`deploy.md:233` classifica isso como anti-pattern explícito).

Consequência derivada: as quatro métricas DORA exigidas por `release.md:339-346` são
incalculáveis, porque não há nem tag de release nem registro de deploy.

---

## Notas de correção ao briefing

Três números do briefing foram verificados e divergem:

1. **"`pnpm lint` dá 0 erros e ~68 warnings"** — `pnpm lint` **falha com exit 2** e não
   analisa nenhum arquivo. O baseline de 68 warnings só aparece com
   `npx eslint . --ignore-pattern ".claude/**"`. Ver achado 1.

2. **"`pnpm exec tsc --noEmit` tem 3 erros pré-existentes em arquivos de teste"** — são
   **10 erros**, distribuídos em **3 arquivos** de teste. A contagem de arquivos estava certa;
   a de erros, não.

3. **"5 falhas conhecidas em `app/api/chat/__tests__/route.test.ts` são credencial ADC local
   expirada"** — confirmado quanto à causa proximal: o log mostra
   `{"error":"invalid_grant", "error_subtype":"invalid_rapt"}` e as falhas são
   `Test timed out in 5000ms`. Mas o achado relevante não é a credencial: **o teste unitário
   faz chamada de rede real ao GCP**, violando `rules/testing.md:139` ("Nunca rode chamadas
   reais a OpenAI/Gemini em cada CI commit") e `:64` (determinismo). O teste não é hermético —
   passa ou falha conforme o estado de `gcloud auth` da máquina. Tratar como flakiness de
   credencial mascara um defeito de isolamento que também explica por que a suíte degrada de
   5 para 9 falhas sob carga concorrente.

Os demais números do briefing conferem: **1415 testes passando** (de 1420, em 241 arquivos)
e **5 falhas** concentradas naquele arquivo.
