# Revisão de módulos e aderência às convenções de engenharia

**Data:** 2026-08-04
**Branch:** `chore/limpeza-vila-rosa`
**Escopo:** inventário completo dos módulos e funcionalidades do liquid-dataviz e
análise de aderência de cada um às convenções do harness DDC (`.contexts/engineering/`,
73 arquivos), mais identificação das convenções que faltam.

**Método:** seis auditorias independentes e paralelas, cada uma com uma fatia do
produto e lendo apenas as convenções aplicáveis a ela. Regra dada a todas: toda
afirmação com evidência `arquivo:linha` ou saída de comando, e tentativa de
refutação antes de reportar um achado. Detalhamento por área em
[`2026-08-04-parts/`](./2026-08-04-parts/).

> **Nota de contexto:** o harness DDC foi instalado NESTE dia, junto com a
> auditoria. `.contexts/` foi copiado inteiro; `.claude/` foi **mesclado** (14
> agentes do harness + os 5 específicos do projeto preservados); `CLAUDE.md`
> virou harness no topo + contexto do produto abaixo. Backups em
> `CLAUDE.projeto.md.bak` e `.claude.bak`. Portanto: **este é o primeiro
> encontro do código com estas convenções.** Um ❌ aqui não significa
> negligência do time — significa que a convenção não existia quando o código
> foi escrito.

---

## 0. Estado das correções (atualizado em 2026-08-04)

**Fechados:** R1, R2, R8, R9, R10, R11, R12, R15, R18 (parcial).

| # | O que foi feito | Commit |
|---|---|---|
| R1+R2 | `maximumBytesBilled` nos dois caminhos (`execute_sql` e `execute-metric`); recipe de LLM passa a ser validada com `MetricDoc` antes do `set()` | `6bb2012`, `0618131` |
| R12 | Schemas Zod nos payloads que definem permissão + `FirestoreDocId` fechando path-injection em `/api/groups` (não estava no relatório) | `24475df` |
| R9 | `error.message` só em dev; produção mostra o `digest` | `9fc657a` |
| R11 | Link de download vira uso único + varredura por TTL — a justificativa "efêmero" da rota passou a ser verdadeira | `4dc719a` |
| R15 | Teste da rota de chat hermético (`loadWorkflows` lia Firestore); ganhou cobertura do caminho de workflow | `4719e26` |
| R10 | `@custom-variant dark` ligado ao `data-theme` (34 regras no CSS compilado) | `1c8e5f4` |
| R8 | Botão real de expandir no `KpiCard` + fim da supressão de foco dos descendentes | `658b7da` |
| R18 | nosniff, Referrer-Policy, HSTS e `frame-ancestors` derivado da allowlist de embed | `f4a1c2b` |

**Efeito colateral relevante:** a suíte passou a rodar **verde de ponta a ponta
(1475 testes)**. As 5 falhas permanentes que eu vinha reportando como "baseline
conhecido" eram o R15 — um arquivo de teste que ninguém podia usar como sinal de
regressão. Duração caiu de ~366s para ~80s.

**Aberto, e por quê:**

| # | Estado |
|---|---|
| R3 | **Decisão de produto.** Mudar o admin por domínio altera o acesso dos 10 usuários de hoje. |
| R4, R5, R6 | Precisam de decisão de desenho antes do código: onde mora o rate-limit (contador por instância não serve em serverless), se o mapa de rotas por métrica vira fail-closed (quebraria métrica fora do mapa), e qual stack de observabilidade de LLM. |
| R7, R13, R14, R16, R17, R19, R20 | Correção mecânica ou fora do código (R17 é configuração do GitHub). Sem bloqueio, só não priorizados. |
| CSP `script-src` | Sai do R18: exige nonce no middleware e validação em staging. |
| L1–L9 | Identificadas, não criadas — conforme decidido. Depende de acionar o `ddc-engineering`. |
| Contradição prompt-em-git × ADR-0017 | Precisa de resolução explícita antes de escrever `contracts/ai-config.md`. |

---

## 1. Números

| Área | Módulos inventariados | Linhas de aderência | ✅ | ⚠️ | ❌ | n/a |
|---|---|---|---|---|---|---|
| Frontend / UI | 58 (10 grupos de produto) | 88 | — | — | — | — |
| Backend / API / segurança | 39 rotas · 84 handlers · 16 módulos de auth | 76 | 31 | 19 | 26 | — |
| Dados / storage / semântica | 46 + 15 scripts | 82 | 22 | 25 | 34 | 1 |
| Camada de IA | 41 | 58 | 25 | 15 | 17 | 1 |
| Processo / qualidade / entrega | transversal | 117 | 33 | 26 | 57 | 1 |
| **Total** | **~184 módulos** | **421 linhas** | | | | |

Lacunas de convenção: **9 confirmadas** · convenções não aplicáveis: **11**.

---

## 2. Inventário de módulos (visão organizada)

Detalhe completo, com caminho e responsabilidade de cada módulo, nos arquivos de
`2026-08-04-parts/`. Aqui, a organização por domínio de produto:

### 2.1 Shell e navegação
Header global (`AppHeader`), coluna de páginas (`PagesSidebar`), chat lateral
(`ChatSidebar`), layout raiz (`DashboardLayout`), home que resolve a primeira
página do cliente (`src/pages/home`), atalhos de teclado, tema.

### 2.2 Relatórios dinâmicos — o produto
`app/(dashboard)/g/[groupId]/r/[reportId]` → `ReportPage` → `CanvasPanel` →
`CanvasBlockRenderer` → blocos (`kpi`, `chart`, `table`, `text`, `gauge`).
A renderização de bloco vive em `src/pages/explore/ui/`, não em `widgets/`.

### 2.3 Camada semântica (o coração)
`metric.recipe` → `dataContract` → `client.productBindings` → BigQuery.
Executada por `execute-metric.ts`, exposta em `/api/metrics/batch` e
`/api/metrics/[id]/data`, consumida por `useReportData`.

### 2.4 Inteligência artificial — dois orquestradores distintos
- **Analítico** (`/api/chat`): supervisor Mastra + 8 sub-agentes
  (`descriptive`, `diagnostic`, `predictive`, `prescriptive`, `monitoring`,
  `simulation`, `external`, `cashflow`). Config em Firestore (`aiAgents`,
  `aiSkills`, `aiWorkflows`) com fallback em código.
- **Canvas** (`/api/canvas-chat`): geração de dashboard, tools próprias,
  concede `ask_user` — que o analítico não tem.

### 2.5 Administração
Clientes, grupos de permissão, usuários, produtos, data contracts, métricas,
templates, e o AI Studio (agentes, skills, workflows, knowledge bases).

### 2.6 Filtros, export e auth
`FilterPanel` / `PageFilterBar` / `GlobalFilters`; export de PDF via Puppeteer;
Firebase Auth com modo embutido por `postMessage`.

### 2.7 Suporte
Catálogo SQL, evals e judge drift, RAG, memória de conversa, landing e `/docs`.

---

## 3. Achados — duas listas, duas respostas diferentes

A separação abaixo é deliberada. Misturar risco de código com lacuna de
documento numa fila única faz os dois atrasarem: um pede commit, o outro pede
decisão.

### 3.1 RISCO EM CÓDIGO RODANDO — vira backlog de correção

| # | Achado | Evidência | Gravidade |
|---|---|---|---|
| R1 | **`execute_sql` sem teto de custo.** `maximumBytesBilled` não existe em lugar nenhum do repo. A tool é concedida aos 8 sub-agentes; query gerada por LLM pode varrer volume arbitrário do BigQuery. | `src/features/ai-agents/tools/execute-sql.ts:18-27`; grep `maximumBytesBilled` = 0 | **Alta** |
| R2 | **SQL de LLM persistido sem validação.** `recipe.template` é gravado em `metrics/{id}` sem `MetricDoc.parse`, e depois executado sem teto. Mesma exposição de R1 por outra porta. | `create-chat-metric.ts:51`, `execute-metric.ts:252` | **Alta** |
| R3 | **Admin global por sufixo de domínio, com default hardcoded.** Env ausente não falha o boot — cai em `'askliquid.com'` e concede super-admin. Não há degrau entre "do domínio" e "irrestrito"; o gate por claim `role==='admin'` é neutralizado por fallback. | `runtime-config.ts:32-35`, `:1`; `require-admin.ts:60-63` | **Alta** |
| R4 | **Zero rate limiting.** Nenhum `429` no repo, incluindo `/api/chat` (`maxDuration=300`), `/api/canvas-chat` (`600`) e `/api/export-pdf`, que sobe um Chrome por request. | grep `429`/`Retry-After` = 0 | **Alta** |
| R5 | **Enforcement de rota por métrica é fail-open por omissão.** Allowlist manual de 64 ids; métrica fora do mapa perde o gate de rota e sobra só tenant-check. | `metric-route-map.ts`, `execute-metric.ts:150-154` | Média |
| R6 | **Sem observabilidade de LLM.** Nenhum pacote OTel, `new Mastra({agents})` sem `telemetry`, "span" é `console.log`. Sem visibilidade de token, custo ou latência nas duas rotas. | `instance.ts:47`, `record-span.ts:14` | Média |
| R7 | **Prompt exige citação de fonte e nada verifica.** `aiWorkflows/default` pede citação; `require-citation` só existe em spec e `validateAgentResult` não existe. | Firestore `aiWorkflows/default`; `seed/manifest.ts:51` | Média |
| R8 | **Widgets principais inacessíveis por teclado.** `ChartWidget` e `KpiCard` expandem via `<div onClick>` sem `role`/`tabIndex`/handler de tecla, e matam o anel de foco dos descendentes. | `ChartWidget.tsx:53-62`, `KpiCard.tsx:248-255`, `globals.css:177-186` | Média |
| R9 | **`error.message` cru na UI em produção.** | `app/error.tsx:34-47` | Média |
| R10 | **`dark:` sem `@variant dark`.** 12 usos seguem o `prefers-color-scheme` do SO, não o `data-theme` que o next-themes escreve. | 12 ocorrências; `globals.css` | Baixa |
| R11 | **Arquivos de `/tmp` nunca são apagados.** O `/api/download/[filename]` é não-autenticado por design documentado (UUID + regex anti-traversal), mas a justificativa depende de os arquivos serem efêmeros — e nada no repo os remove. | `api/download/[filename]/route.ts:13-15`; grep `unlink` em `app/` = 0 | Média |
| R12 | **Validação Zod ausente onde o payload define permissão.** `groups.routes[]` e `users.clientAccess[].routeOverrides` entram por cast; `/api/reports` grava `blockMap`/`layout` como `unknown`. | `api/groups/route.ts:44-49`, `api/users/route.ts:67-76` | Média |
| R13 | **8 cópias locais do helper de auth**, divergentes de `verifyAuthToken`, cada uma replicando o fail-open de dev. | 7× `verifyAuth` + `schema-detect/v2/route.ts:35` | Média |
| R14 | **O repo não reprovisiona do zero.** Os seeds que criavam `dataContracts/liquid-play`, `products/*`, `groups/*` e `clients` foram removidos; os sobreviventes só estendem e abortam se a base não existir. | commit `f8c47c5`; `seed-liquid-play-plus-v2-contract.mjs:348` | Média |
| R15 | **Teste unitário faz rede real.** As falhas de `app/api/chat/__tests__/route.test.ts` são ADC expirado — a causa raiz é o teste não ser hermético, o que também explica a degradação sob carga. | `route.test.ts:92,116` | Média |
| R16 | **Zero rastreabilidade de release.** 0 tags em 911 commits, imagem publicada como `:latest` sem `GIT_SHA`, HEALTHCHECK em `/` em vez de endpoint de saúde. Não há ponto de rollback identificável. | `Dockerfile:102` | Média |
| R17 | **Governança de PR ausente.** 0 de 49 PRs com aprovação humana; `develop` sem branch protection; PR #46 aberto com os commits já no trunk. | GitHub API | Média |
| R18 | **Sem headers de segurança.** `next.config.ts` define só COOP — faltam HSTS, CSP, `nosniff`, `Referrer-Policy`. | `next.config.ts:5-17` | Média |
| R19 | **Zero campos de autoria e `schemaVersion`** em todas as coleções, durante migração ativa de binding flat↔nested detectada por heurística. | grep `createdBy`/`schemaVersion` = 0 | Baixa |
| R20 | **`benchmark-cache` agrega cross-tenant.** Lê todos os `clients` e monta payload único. | `benchmark-cache.ts:20` | A confirmar |

### 3.2 LACUNAS DE CONVENÇÃO — vira decisão sobre acionar o `ddc-engineering`

O agente `ddc-engineering` está disponível no projeto. Conforme decidido, as
lacunas foram **identificadas, não criadas**.

| # | Convenção faltante | Por que falta | Risco de seguir sem |
|---|---|---|---|
| L1 | `rules/tenancy.md` | As convenções existentes prescrevem `tenantId` + rule por token — modelo que este produto **não usa** (é `clientAccess[]` → claim `clientIds[]`, ADR-0018). A doutrina real vive em JSDoc. | Já regrediu uma vez: `api-auth.ts:153-159` documenta vazamento de datasets órfãos corrigido |
| L2 | `contracts/semantic-layer.md` | Grep por `semantic layer\|recipe\|dataContract\|productBinding` em todo `.contexts/` = **0**. O coração do produto não tem uma linha de convenção. | A distinção entre ref fail-loud e ref soft+warning só existe em comentário |
| L3 | `rules/cost.md` | Quatro tetos em quatro arquivos desconectados; `harness-engineering.md:111` delega a uma seção de governança que não existe. | R1 e R2 são consequência direta |
| L4 | `contracts/ai-config.md` | Prompt versionado em banco (ADR-0017) sem convenção de fonte-da-verdade, versionamento ou rollback. | `repo.ts:126-134` grava com `set(merge:true)` sem histórico — o rollback prescrito não tem para onde voltar |
| L5–L9 | evals/judge drift, seeds e reprovisionamento, observabilidade de LLM, feature flags, naming de coleção | Ver [`lacunas.md`](./2026-08-04-parts/lacunas.md) | — |

**Contradição direta entre convenções e ADR:** `harness-engineering.md:30` e
`governance.md:120` mandam versionar prompt em git — o **oposto** do que a
ADR-0017 (`Accepted`) decidiu. Precisa de resolução explícita, não de escolha
tácita de quem lê primeiro.

### 3.3 RUÍDO — convenções que não se aplicam a este produto

| Convenção | Situação |
|---|---|
| `contracts/postgres.md`, `contracts/pgvector.md` | ADR-0013 descontinuou Postgres/pgvector. Mas `.contexts/engineering/MEMORY.md:24-25` fixa os dois no baseline, e `harness-engineering.md:38,151,214` aponta pgvector como vector store do projeto. |
| `rules/internationalization.md` | Põe toda a UI pt-BR em violação declarada. Precisa de n/a ou exceção formal datada. |
| `stacks/ai/vercel-ai-sdk.md`, `stacks/ai/mastra-sdk.md` | Pinadas em `ai@4.x` e `@mastra/core@0.x`; o repo usa `6.0.116` e `1.32.1`. **Um agente que as siga literalmente escreve código incompatível.** |
| Naming kebab-case de coleção, SCREAMING_SNAKE de enum | Batem em nomes já persistidos e fixados por ADR. Recomendação: exceção registrada, não migração. |

---

## 4. Correções aplicadas durante a auditoria

Dois achados eram regressão introduzida nesta própria sessão e foram corrigidos
de imediato, não deixados para o relatório:

1. **`pnpm lint` estava quebrado.** A remoção de 9 dependências sem uso
   re-resolveu a árvore do pnpm e o `eslint-plugin-react-hooks`, que vinha
   transitivo e hoisted, deixou de ser alcançável — exit 2, gate morto, com
   `eslint-disable react-hooks/*` no código sem ninguém validando. Corrigido
   declarando o plugin e **registrando-o explicitamente** no config, em vez de
   depender de herança transitiva. Voltou a 0 erros / 68 warnings.
2. **Loop de navegação `/dashboard` ↔ `/g`** e **teste sem poder
   discriminante** em `select-template.test.ts` (provado por mutação).

---

## 5. Correções que as auditorias fizeram no briefing

Registro por honestidade metodológica — em cinco pontos eu passei informação
imprecisa e os grupos verificaram em vez de repetir:

- `isAdminEmail` **não** faz todos os usuários passarem pelos gates de tenant;
  só contas do domínio. O problema real é a ausência de degrau intermediário.
- O enforcement por métrica **existe e funciona**; o problema é ser fail-open
  por omissão.
- O `/api/chat` **não** roda como agente único — o docstring do próprio arquivo
  é que está obsoleto.
- `tsc --noEmit` tem **10 erros em 3 arquivos**, não 3 erros.
- `pnpm lint` estava **falhando** quando eu reportava "0 erros".

---

## 6. Limites desta revisão

- **Nenhuma verificação em navegador autenticado.** Firebase Auth bloqueia os
  agentes; tudo foi verificado por leitura de código, testes e git.
- **O achado R20 não foi confirmado** — cruza áreas e ficou pendente.
- **BigQuery não foi auditado** como storage: são 62 datasets num warehouse
  compartilhado com outros sistemas, fora do escopo desta aplicação.
- As auditorias rodaram **em paralelo com correções minhas**, então o
  `processo.md` reporta o lint quebrado que já estava consertado quando ele
  entregou.

---

## 7. Recomendação de sequência

1. **R1 + R2 + R3** primeiro. São exposição de custo e de privilégio em código
   rodando, e as três têm correção pequena e localizada. Falta só decidir os
   números (teto de bytes, e se o domínio continua concedendo admin global).
2. **L1 + L2 + L3** em seguida, via `ddc-engineering`. São as convenções que,
   escritas, teriam evitado R1–R5.
3. **Resolver a contradição prompt-em-git × ADR-0017** antes de escrever
   `contracts/ai-config.md`, senão a convenção nasce contraditória.
4. **Atualizar as três convenções desatualizadas** (`vercel-ai-sdk`,
   `mastra-sdk`, pgvector no `harness-engineering`) — hoje elas induzem a erro
   qualquer agente que as leia.
