# Auditoria: configuração no código × configuração no banco

> Produzida em 2026-08-07 por uma varredura orquestrada: 32 agentes — 1 mapeando
> o que a admin já cadastra (a régua), 6 varrendo áreas distintas do código, e um
> verificador cético por achado, instruído a DERRUBÁ-LO. Dos 24 achados levantados,
> 17 sobreviveram e 7 caíram; os derrubados estão na seção 4, para não serem
> reabertos.

---


## 1. Veredito

**O projeto não está limpo, mas também não está em estado ruim:** as cinco violações estruturais mais graves já caíram nesta sessão (lista de tenants, rotas fixas, businessProfile, allowlist de métricas, cópias de slugify), e o que sobrou são 17 achados confirmados que se concentram em três frentes — o schema físico do Vila Rosa espalhado por código de IA e de BigQuery, os parâmetros de risco/covenant que só mudam com deploy, e fallbacks de infraestrutura que apontam para produção.

Nenhum achado remanescente bloqueia o produto hoje com um único tenant; **o que eles bloqueiam é o segundo cliente** — e três deles (fallbacks de produção) são risco operacional imediato, independente de quantos clientes existam.

---

## 2. O que já é configurável hoje

A administração é uma rota única (`app/(admin)/admin/page.tsx` → `src/features/admin/ui/AdminPage.tsx`) com 12 seções em 4 grupos, mais 3 páginas-ferramenta e o editor de template (`/admin/templates/[id]`).

**Cobertura real por cadastro:**

| Domínio | Coleção | Tem tela? |
|---|---|---|
| Clientes (nome, cor, bindings de produto, businessProfile) | `clients/{id}` | Sim — Admin → Clients |
| Grupos e páginas do cliente (blockMap, layout, filtros) | `clients/{id}/groups/{g}/reports/{r}` | Sim, mas fora da admin: `PagesSidebar` + modo de edição do `ReportPage` |
| Contratos de dados (entidades, atributos, tipos) | `dataContracts/{id}/entities/{e}/attributes/{a}` | Sim — Admin → Data Contracts |
| Métricas (recipe: aggregation / sql / derived) | `metrics/{domain.slug}` | Sim — Admin → Metrics Contracts |
| Produtos | `products/{id}` | Sim — Admin → Products |
| Templates de dashboard (metadados + conteúdo) | `dashboardTemplates/{id}` | Sim — Admin → Templates + editor de canvas |
| Permissões (grupos, usuários, overrides por rota) | `groups/{id}`, `users/{id}` | Sim — Admin → Groups / Users |
| Agentes, skills, workflows, knowledge bases de IA | `aiAgents`, `aiSkills`, `aiWorkflows`, `knowledgeBases` | Sim — Admin → AI Studio |

**As duas lacunas de menor custo e maior retorno já mapeadas pela régua (não são achados novos, são telas que faltam):**

- **`dataSources`** — API CRUD completa (`app/api/data-sources/route.ts`) e hook completo (`src/features/admin/model/useAdminDataSources.ts:37-77`, com `save`/`rename`/`remove` implementados) e **zero componente que os chame**. Onboardar cliente em projeto GCP novo hoje exige `curl` ou inserção manual. Formulário de 4 campos resolve.
- **`relations`** — sem ela não se cria métrica `kind: 'derived'`. API existe (`app/api/relations/route.ts`), lida por `/api/metrics/batch:86`. Hoje as relações vieram só de `scripts/seed-covenants-v2-relations.mjs`. O picker contract→entity→attribute já está pronto e pode ser reaproveitado de `MetricForm.tsx:259-311`.

---

## 3. Achados agrupados por consequência

### GRUPO A — "um ambiente novo escreve em produção sem avisar"
**Gravidade: alta. Esforço: nenhuma tela — só remover fallbacks.**

Três lugares resolvem silenciosamente para o projeto/banco real de produção quando a env var falta:

| Arquivo:linha | O que faz |
|---|---|
| `src/shared/lib/runtime-config.ts:2,4` | `DEFAULT_DATAVIZ_DATABASE_ID = 'liquid-play-dataviz'` — sem `DATAVIZ_DATABASE_ID`, `getDb()` (`src/shared/lib/firebase/admin.ts:56`) lê **e escreve** no banco de produção |
| `scripts/grant-claims.ts:33` | `projectId: process.env.GCP_PROJECT_ID ?? 'liquid-micro-apps'` — e a operação seguinte é `setCustomUserClaims`, uma **escrita de permissão** |
| `scripts/seed-vila-rosa-client.mjs:61` + `seed-vila-rosa-reports.mjs:37-38`, `seed-covenants-v2-relations.mjs:58`, `seed-covenants-v2-metrics.mjs:96`, `seed-covenants-templates.ts:33`, `seed-liquid-play-plus-v2-contract.mjs:32`, `patch-covenants-snapshot-pin.mjs:24` | `PROJECT_ID`/`DB_ID` de produção como `const` literal, sem env nem flag |

**O que muda:** trocar todo fallback por falha explícita. O padrão correto já existe no próprio repositório: `resolverProjeto()` em `scripts/lib/firestore-conexao.ts:22-34` aborta com `process.exit(1)` e mensagem — já adotado por `bootstrap-user.ts` e `bq-bootstrap-bqml-datasets.ts`. `grant-claims.ts` é o pior caso: ele não deixa o SDK adivinhar, ele **aponta deliberadamente** para produção.

**Esforço:** horas. Nenhuma coleção, nenhuma tela.

---

### GRUPO B — "cliente novo nasceria quebrado: o schema físico do Vila Rosa está espalhado em código"
**Gravidade: alta. Esforço: casa existe no banco, mas parcialmente vazia — e falta um campo no schema.**

Quatro lugares independentes fixam o schema físico de um cliente. Nenhum consulta os bindings do Firestore.

| Arquivo:linha | O que fixa |
|---|---|
| `src/shared/config/agents/shared-context.ts:77-160` (`_buildSchemaContext()`) | Schema completo de `contratos`/`pagamentos`/`fluxo_caixa` — coluna, tipo e **valores categóricos** (`faixa_ltv`, `rating_liquid` A-H) — injetado no prompt dos 8 sub-agentes e do `canvas-orchestrator` quando `hasClientSchema()` é falso |
| `src/features/ai-agents/lib/column-validator.ts:5` | Whitelist de ~30 colunas de `contratos` (`CONTRATOS_COLUMNS`/`NUMERIC_COLUMNS`/`DIMENSION_COLUMNS`) que valida o SQL gerado pelo LLM em 5 tools analíticas |
| `src/shared/lib/bigquery/client.ts:86` | `TABLES = { contratos, pagamentos, fluxo_caixa }` — consumido por `queryFilterOptions` e `queryBenchmarkAggregated` (`queries.ts:23,30,136`) e pela tool `get_sample_data` (`get-sample-data.ts:4,31`) |
| `src/shared/providers/DataProvider.tsx:45` (`ADVANCED_FILTER_OPTIONS`) + `src/shared/lib/metrics/dashboard-ambient.ts:20-25` | 6 listas de valores (rating A-H, elegibilidade, faixas de LTV, faixas de atraso, PF/PJ, grupos de repasse) mapeadas 1-para-1 para colunas físicas do Vila Rosa. No mesmo arquivo, `projetoOptions`/`dataBaseOptions` **são** buscados dinamicamente — a inconsistência está dentro de um arquivo só |

**O que muda:** um cliente cuja tabela não se chame `contratos` ou cujas faixas de LTV sejam outras não é onboardável pela tela. E há um caminho configurável **coexistindo** com o hardcoded para o mesmo conceito: `resolve-metric.ts::tableRef()` (linhas 130-144) já faz `binding.tableBindings?.[entityId] ?? entityId`; `TABLES` ignora isso.

**Esforço — misto, e este grupo tem uma incógnita que precisa ser checada antes de estimar:**
- `client.ts:86` e `column-validator.ts:5`: **casa existe, é só parar de duplicar** — consumir `tableBindings` e `dataContracts/.../attributes` via `ClientSemanticContext` (`src/shared/repositories/client-semantic-context.ts`), já implementado e lido em runtime.
- `ADVANCED_FILTER_OPTIONS`: **falta campo no schema.** `AttributeDoc` (`src/shared/schemas/data-contract.ts:53-71`) não tem lugar estruturado para valores enumerados — só `label`, `description`, `type`, `unit`. Hoje as faixas só caberiam no texto livre de `description`.
- `shared-context.ts:77-160`: **verificar antes de agir.** O verificador derrubou a premissa de que `hasClientSchema()` seria sempre falso. `scripts/seed-vila-rosa-client.mjs` já populou `schemaBindings`, e `hasClientSchema()` é uma checagem **global** (`some` sobre todos os data contracts do cliente, não por domínio). Se o domínio covenants já satisfaz a checagem, o fallback é omitido do prompt inteiro — e como não há evidência de que `dataContracts/liquid-play/entities/contratos/attributes/*` exista no Firestore (o script que os criava saiu do repo em 3/8), os sub-agentes ficariam **sem nenhuma** documentação de schema para contratos/pagamentos/fluxo_caixa. Isso não é verificável estaticamente: exige inspecionar o Firestore de produção.

---

### GRUPO C — "regra de negócio do cliente exige deploy"
**Gravidade: alta a baixa. Esforço: precisa de cadastro novo — nem coleção nem tela existem.**

| Arquivo:linha | O que fixa | Duplicado em |
|---|---|---|
| `src/shared/config/agents/monitoring-agent.ts:27` | Covenants "típicos": inadimplência ≤7%, over-90 ≤5%, elegibilidade ≥70%, LTV médio ≤80%; mais critérios de elegibilidade CRI (LTV ≤80%, atraso ≤90d, rating mínimo D) e limite CVM 60 (20% por devedor) — e o prompt manda usar "EXATAMENTE estas fórmulas" | `check-covenant-triggers.ts`, `check-eligibility.ts` (maxLtv=0.8, maxDiasAtraso=90, minRating='D'), `check-concentration-limits.ts` (limitePct=20) — todos como `.default()` no schema Zod |
| `src/shared/config/agents/shared-context.ts:31-42` | Escala de rating Liquid (900–1000 = A ... 0–299 = H) — modelo de crédito proprietário, recalibrável | — |
| `src/features/ai-agents/tools/lgd-utils.ts:14` | `LGD_COALESCE_EXPR` com fallback de LGD em **0.45** quando `valor_imovel` é nulo | Duplicado em JS em `calculate-stressed-ecl.ts:111` (o único consumidor real — `calculate-pd-lgd.ts` usa só `LGD_EXPR`, sem o fallback) |

**O que muda:** covenant é, por definição do próprio glossário, cláusula que **varia por operação**. Hoje o valor "padrão" vive em dois lugares (prompt + `.default()` do Zod) e não há nenhum campo em `ToolContext` para override por cliente. Mudar o covenant de um cliente real = editar prompt + tool + deploy.

**Esforço:** o mais caro do relatório. Não existe coleção `covenants` (as telas do Play foram removidas junto com as rotas fixas). Precisa de: campo novo em `clients/{id}` (ex. `covenants`, cobrindo covenants + elegibilidade + concentração juntos, já que hoje vivem no mesmo prompt e teriam o mesmo dono), tela dedicada, e as tools passando a ler do contexto em vez de `.default()`. Para o rating há precedente explícito: `src/shared/schemas/client.ts:16-30` documenta que `ClientBusinessProfile` foi criado exatamente para tirar contexto de negócio estático do bundle — a tabela de rating ficou de fora daquele refactor.

---

### GRUPO D — "exige deploy para ajustar custo, latência ou modelo de IA"
**Gravidade: alta / média. Esforço: um item é one-liner, o outro precisa de coleção pequena.**

| Arquivo:linha | O que fixa |
|---|---|
| `src/features/ai-agents/model-registry.ts:9` | De-para tier → modelo Vertex real (`router`→flash-lite, `fast`/`flash`→flash, `reasoning`→pro) e `THINKING_BUDGET` por tier (2048/8192). `aiAgents.model` na admin só escolhe entre os 4 tiers literais (`create-mastra-agent-from-config.ts:38-42`) — nunca o modelo por trás deles |
| `app/api/schema-detect/v2/route.ts:138` | `const model = vertex('gemini-2.5-flash')` — a rota ignora o registry central e crava o nome do modelo no handler |

**O que muda:** quando a Vertex depreciar `gemini-2.5-flash`, ou quando alguém quiser recalibrar custo, o caminho é achar e editar arquivos específicos e dar deploy. ADR-0017 declara a config do AI Studio canônica no banco, mas a camada "qual modelo físico responde por este tier" ficou fora do escopo.

**Esforço:**
- `schema-detect/v2/route.ts:138` — **uma linha**: trocar por `getModel('fast')`. Faça hoje.
- `model-registry.ts:9` — coleção nova pequena (`modelTiers/{tier}` com `modelId` + `thinkingBudget`) ou expandir `aiAgents` para aceitar `modelId` completo. Tela mínima ou até seed + edição pela AI Studio.

---

### GRUPO E — "mesmo dado em quatro lugares, divergindo em silêncio"
**Gravidade: baixa/média. Esforço: dedupe de tipos, sem tela.**

O enum de categoria e segmento de template está copiado à mão em **quatro** arquivos:

1. `src/shared/schemas/dashboard-template.ts:17-18` — canônico, `z.enum`, é o que valida os documentos reais no Firestore
2. `src/shared/config/dashboard-templates.ts:38,44,67` — cópia manual (`TemplateSegment`, `category`, `TEMPLATE_CATEGORIES`), com comentário de cabeçalho admitindo que sobreviveu à migração Tier 2c
3. `src/features/admin/ui/TemplateForm.tsx:15,17,31-33` — cópia na tela
4. `src/shared/lib/firestore/dashboard-templates.ts:8,10` — cópia no tipo de retorno da API

E uma quinta camada duplica a **apresentação** desse vocabulário: `src/widgets/pages-sidebar/ui/TemplateGallery.tsx:35` (`SEGMENT_META` com rótulo e cor hex por segmento) e `:28` (`CATEGORY_ICONS`).

**O que muda:** atualizar uma cópia sem as outras não dá erro de compilação — só comportamento inconsistente entre o que a tela deixa salvar e o que a API declara aceitar. Nota transversal: `segment: 'sbpe' | 'mcmv'` é vocabulário de **um** cliente (programas habitacionais brasileiros) dentro de um schema global; cliente fora do setor imobiliário não tem onde declarar seu segmento.

**Esforço:** baixo para o dedupe (importar tipo do schema Zod; itens 2 e 4 devem ser resolvidos juntos, já que o 4 **já importa** do 2). Se quiserem taxonomia cadastrável, o desenho certo não é `segmentMeta` por documento (duplicaria o rótulo entre templates do mesmo segmento) — é uma tabela de taxonomia própria (`{key, label, color, icon}`), no mesmo padrão de `products/{id}.color`.

---

### GRUPO F — "conteúdo de domínio na UI que quebra em silêncio"
**Gravidade: média/baixa. Esforço: campo novo em telas que já existem.**

| Arquivo:linha | O que fixa | Como quebra |
|---|---|---|
| `src/shared/config/indicator-suggestions.ts:6` | 55 entradas top-level (~1150 linhas) com 4 perguntas sugeridas por bloco, indexadas pelo **texto exibido** (`'Total de Contratos'`) | `ChartWidget`/`DataTableWidget`/`KpiExpandedModal` montam o prompt com `block.title`/`block.label`, e `getIndicatorSuggestions` (linha 1110) extrai esse texto via regex `/"([^"]+)"/` para o lookup. Renomear o KPI em `BlockInspector` mata as sugestões sem aviso |
| `src/pages/explore/ui/blocks/status-badge.ts:8` | `DEFAULTS` mapeia 4 palavras em português ('Válida', 'Inválida', 'Vencida', 'Pendente') → cor semântica, para qualquer coluna `format: 'status-badge'` | Cliente com outro vocabulário cai em `neutral` em silêncio quando o autor do relatório não declara `col.statusMap` |
| `src/pages/explore/ui/ExploreWelcome.tsx:7` + `src/widgets/ai-sidebar/ui/AISidebar.tsx:303-306` | Prompts de exemplo com jargão de um negócio ('repasse', 'safra', 'LTV', 'empreendimentos') | Cliente de outro setor não reconhece a própria tela de entrada do chat |

**Esforço:** baixo, e as casas já existem.
- Sugestões de bloco → campo novo `metrics.suggestedQuestions[]` em `metrics/{domain.slug}`, editável no `MetricForm.tsx` já existente, **chaveado por `block.metricId`** (estável) em vez de label (instável). Isso corrige a fragilidade, não só move o dado.
- Sugestões de chat → campo em `businessProfile`, já editável em `ClientForm`/`BusinessProfileEditor`.
- Status → `attributes/{a}.statusColors` no Data Contract (mesma tela do Grupo B).

---

## 4. O que NÃO é problema

Sete candidatos foram levantados e derrubados pelo verificador. Registro aqui para evitar retrabalho — **não reabram estes:**

| Item | Por que é legítimo |
|---|---|
| `src/shared/config/glossary.ts` (~40 termos) | O schema já trata isso como **baseline deliberado**: `client.ts:45-56` define `glossaryOverrides` com o comentário "termos que este cliente usa diferente do glossário padrão". O cadastro por cliente já existe; o baseline em código é a decisão, não o esquecimento. ADR-0017 (Accepted) ainda diz que tools seguem code-wired nesta fase |
| Personas e ICPs (`business-context/index.ts:29-58`) | O arquivo documenta a escolha nas linhas 95-101: taxonomia de produto, não dado de cliente ("trocá-los é mudar o produto, não cadastrar"). Coerente com a rule `data-modeling` (enum quando estável). O plano original (`2026-05-04-sprint1-D`) já desenhava lista fixa selecionável, nunca CRUD |
| `STRESS_MULTIPLIERS` (`calculate-stressed-ecl.ts:10-15`) | É o padrão da pasta inteira, não um caso isolado — `apply-stress-macro.ts` (elasticidades, baselines de Selic/IPCA) e `optimize-allocation.ts` (pesos 0.4/0.3/0.3) fazem o mesmo. `ToolContext` não tem canal para parâmetros de metodologia. E a tool **devolve** os multiplicadores no output — é default visível, não config oculta. Se for mudar, é ADR cobrindo 3-4 tools, não achado pontual |
| `QS_MIN = 0.7` e `FIVE_GB` (`sql-catalog/[id]/approve/route.ts:23-24`) | ADR-0009 (Accepted) **fixa os números**, não só a política ("`bytes_processed > 5GB`", "`qualityScore ≥ 0.7`"). Mover para admin permitiria afrouxar a régua sem ADR nova — o inverso do que a decisão pretende. (Nit real: a rota redefine `QS_MIN` local em vez de importar `QUALITY_SCORE_MIN` de `sql-catalog/repository.ts:47` — isso é DRY, não config) |
| Rate limits (`chat/route.ts:70` = 20, `canvas-chat/route.ts:22` = 10, `export-pdf/route.ts:30` = 5) | Remediação documentada do achado R4 (`docs/reviews/2026-08-04-parts/backend.md`), calibrada por custo de runtime de cada rota (canvas roda até 10 min; PDF sobe um Chrome). Salvaguarda técnica, não entidade da tese |
| `TOOL_MANIFEST` (60 tools) | A própria tela `ToolsCatalog.tsx` imprime "read-only — definidas em código". Tool é implementação |
| `ALL_ROUTES` (`admin/model/types.ts:96-100`) | 3 entradas, todas infraestrutura de rota do app (`/dashboard`, `/explore`, `/g`), e o JSDoc argumenta que nada com nome de produto entra ali. **Decisão a confirmar, não violação** |
| `parameterize-sql.ts:17-19,27-37` | Reenquadrado, não descartado: a regex com `data_base_report`/`projeto`/`contratos` não é o ponto de falha — é consequência de 4 outros arquivos que garantem esses literais (`shared-context.ts:79-152,207-209`, `query-data.ts:35-36,91-92`, `sub-agent.ts:156-171`, `get-filter-options.ts:14-24`). Corrigir só a regex resolve 1 de 5. **Isto é o Grupo B**, e deve ser tratado lá, como escopo de feature |

---

## 5. Recomendação — os três primeiros

**1. Matar os fallbacks para produção (Grupo A).**
`src/shared/lib/runtime-config.ts:2,4`, `scripts/grant-claims.ts:33`, e os 7 scripts de seed. É o único grupo cujo custo de "não fazer" não é *deploy chato* e sim *dado de produção corrompido por um ambiente que esqueceu uma env var*. O padrão de correção já está escrito e em uso no próprio diretório (`resolverProjeto()` em `scripts/lib/firestore-conexao.ts:22-34`). Não precisa de decisão de produto, não precisa de tela, e nenhum outro item da lista fica mais barato se este esperar. **Custo: horas.**

**2. Verificar `hasClientSchema()` no Firestore de produção antes de qualquer coisa no Grupo B.**
Não é uma correção, é uma checagem de dez minutos com consequência grande. Se `hasClientSchema()` já retorna `true` para vila-rosa (plausível: os seeds de covenants populam `schemaBindings`, e a checagem é global via `some`, não por domínio), então `_buildSchemaContext()` (`shared-context.ts:77-160`) **já não está sendo injetado** e os 8 sub-agentes estão operando sem documentação nenhuma de `contratos`/`pagamentos`/`fluxo_caixa` — nem a hardcoded, nem a data-driven, já que o script que criava esses atributos saiu do repo em 3/8. Isso seria degradação silenciosa de qualidade de resposta em produção, hoje, com o único cliente ativo. Se a hipótese se confirmar, este item vira prioridade 1 e reordena o resto do relatório.

**3. `app/api/schema-detect/v2/route.ts:138` → `getModel('fast')`, e em seguida a coleção `modelTiers`.**
A troca da rota é literalmente uma linha e elimina o único ponto do runtime que instancia `vertex(...)` fora do registry central. Feito isso, `model-registry.ts:9` fica sendo o **único** lugar onde "qual modelo físico responde por este tier" é decidido — o que transforma o item seguinte (coleção pequena ou expansão de `aiAgents`) num refactor de um arquivo em vez de uma caçada. Custo/depreciação de modelo é o tipo de ajuste que se quer fazer sem release, e ADR-0017 já estabelece a direção.

**O que eu não faria agora:** o Grupo C (covenants, rating, LGD). É o mais caro — coleção nova, tela nova, e mudança no contrato das tools — e o retorno só aparece com o segundo cliente ou com a primeira operação de covenant real diferente do padrão. Vale abrir ADR e deixar pronto para quando houver demanda concreta, não vale abrir código agora. O Grupo E (enums duplicados) é ótimo candidato a tarefa de oportunidade: baixo risco, faz-se junto de qualquer PR que já toque templates.

---

## Adendo (2026-08-07, mesmo dia) — a checagem da recomendação nº 2 foi feita

**Resultado: `hasClientSchema()` retorna TRUE em produção.** Medido no
`liquid-play-dataviz`: o cliente tem 238 mapeamentos em
`productBindings[].schemaBindings`, e 231 dos 265 atributos declarados nos
contratos resolvem uma coluna física.

Consequência: **o texto de schema hardcoded NÃO está sendo injetado**, e os
sub-agentes recebem o schema montado a partir do banco. A degradação silenciosa
temida na recomendação nº 2 **não está acontecendo**. O caminho data-driven está
vivo e funcionando.

### Isso reformula o Grupo B, e para pior num ponto

`_buildSchemaContext()` (`shared-context.ts:77-160`, 84 linhas com o schema do
Vila Rosa) é **código morto para o único cliente vivo**. Ele só dispara para um
cliente SEM `schemaBindings` — ou seja, meio provisionado. E aí ele injeta as
colunas do Vila Rosa no prompt de OUTRO cliente, apresentadas ao modelo como
fato.

Um fallback que mente é pior que fallback nenhum: sem ele, o agente diz que não
sabe; com ele, o agente responde com confiança sobre colunas que não existem
naquele cliente. A correção certa não é "tornar data-driven" — já é. É **apagar
o fallback ou fazê-lo falhar alto**.

### Nota de método

A primeira execução desta checagem mediu o campo errado: leu
`dataContracts/.../attributes/{a}.column` direto do Firestore, onde ele está
sempre vazio, e teria concluído o oposto. `column` não é campo guardado no
atributo — é preenchido em tempo de leitura por
`client-semantic-context.ts:224`, a partir dos `schemaBindings` do cliente. O
erro foi pego antes de virar conclusão, relendo o repositório em vez de confiar
na leitura crua.
