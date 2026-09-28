# Registro de Achados Verificados — Auditoria de Produto

- **Data:** 2026-07-21
- **Metodologia:** `docs/superpowers/specs/2026-07-21-revisao-remediacao-design.md` (spec aprovado)
- **Branch auditada:** `feat/vila-rosa-covenants-v2`
- **Status:** ⚠️ **PARCIAL** — a execução atingiu o limite mensal de créditos da organização no meio do run.

## Pendências desta execução

1. **Estágio E9 (Frontend) não auditado** — hipóteses do Apêndice A pendentes: #50, #51, #52, #53, #54, #55, #56, #57, #58, #59, #60, #61, #62.
2. **Raia OPS (Operar & Observar) não auditada** — incluindo a hipótese `/api/benchmark` (§4 do spec).
3. **Pass adversarial pendente em 25 achados** que o exigem pela regra do §6.5 (marcados como `⏳ pendente` abaixo). Até lá, seus vereditos são os do auditor de estágio (1 passada), não os do protocolo completo.

## Estatísticas

| Métrica | Valor |
|---|---|
| Achados registrados | 106 (de 5/7 auditores) |
| Por severidade | alta: 13 · média: 52 · baixa: 41 |
| Por verificação (auditor) | confirmado: 104 · plausível: 2 · refutado: 0 |
| Bloqueiam DoD | DoD-1: 10 · DoD-2: 7 · nenhum: 89 |
| Novos (fora do Apêndice A) | 29 (razão novo:hipótese = 29:77) |
| Pass adversarial | concluído: 8 (refutados: 0) · pendente: 25 |
| Hipóteses do Apêndice A sem veredito | nenhuma (fora E9) |

---

# a1-dados — E1 DataSources & BigQuery + E2 Data Contracts & Relations

> **Varredura (resumo do auditor):** Varredura E1+E2 100% estática (READ-ONLY respeitado; nenhum script executado, nenhum cliente GCP inicializado, nenhum teste rodado — a evidência de código bastou). Superfícies lidas integralmente: rotas app/api/data-sources, data-contracts (+entities/+attributes, incl. [entityId]), relations (+teste), schema-detect/v2, filter-options (+match-client-dataset), metrics (route + filter-values + execute-metric + resolve-metric); lib bigquery completa (client, queries, identifier, schema-resolver, benchmark-cache, sql-generation-logger, data-source-repo); schemas (data-source, data-contract, relation, metric/AttributeRef); seeds estáticos (seed-liquid-play-contracts, seed-liquid-play-plus-v2-contract, seed-covenants-v2-relations, seed-vila-rosa-client) e catálogo scripts/metrics/covenants-v2.mjs; scripts liquid_aux (bq-load-aux-tables.ts, lib/aux-tables-parse.ts — parsing limpo, dry-run seguro); consumidores Admin UI (useAdminEntities/useAdminAttributes/useContractSchema/EntityRefsPicker/ClientForm). Checklist positivo aplicado: literais de projeto GCP (6 sites liquid_aux em recipes → #19; seeds usam bq-data-wh só como dado de seed); branches NODE_ENV (só isDevAuthBypassEnabled, contido por construção — item de regressão, não achado); fail-open em permissão (nenhum return true indevido em rota de escrita; GETs globais sem escopo reportados como novo); @deprecated importados (retrocompat documentada, #25); tipos seed vs contract (#22/#23, dois sentidos); zod presente em todas as escritas (relations só formato → novo); anti-overwrite (contract hard-delete tem guard, entity/attribute não → novo; POSTs são upsert com merge:false que apaga createdAt → novo). Resultado: 15 hipóteses → 13 findings (14/15/16 consolidadas por causa-raiz única, todas confirmadas; nenhuma refutada) + 8 achados novos (razão novo:hipótese = 8:15). Questão-aberta-1 do spec §8 parcialmente resolvida: produtos liquid-play declaram as 10 rotas padrão e vila-rosa os assina, mas as asserções do DoD-1 exigem só o fluxo /g — filter-options mantido como dívida. NÃO coberto por tempo/escopo: front DataProvider/NavSidebar (E9) p/ fechar em definitivo a questão-aberta-1; api-auth.ts (verifyDatasetAccess/verifyRouteAccess) em profundidade (E8, na lista de regressão); rotas products/clients além do grep de merge:false; execução de vitest e pnpm lint (dispensados — evidência estática com arquivo:linha lida nesta sessão).

## `a1-dados-01` · CLAUDE.md descreve fluxo fetchBigQuery→/api/bigquery que não existe mais

| Campo | Valor |
|---|---|
| Origem | #11 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / ativo |
| Tipo / Lente | doc-drift / L4 |
| Estágio | E1 |
| Componente | CLAUDE.md (seção Data Flow) + .claude/agents/credit-risk-analyst.md |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `claudemd-fluxo-bigquery-desatualizado` |

**Evidência:** CLAUDE.md:71-73 ('Page hooks call fetchBigQuery(action, params)' + 'POST to /api/bigquery'); grep fetchBigQuery em src/ = 0 (só CLAUDE.md e .claude/agents/credit-risk-analyst.md:82); Glob app/api/bigquery/** = vazio; fluxo real: src/shared/hooks/useReportData.ts:72 (fetch('/api/metrics/batch')); app/api/filter-options/route.ts:9-15 documenta que a antiga /api/bigquery foi substituída

A rota /api/bigquery não existe no repo e não há símbolo fetchBigQuery em src/. O agente credit-risk-analyst.md instrui explicitamente a usar o padrão inexistente — quem seguir a doc escreve código contra API fantasma. Verificado por grep positivo (fluxo real) + negativo (referente da doc).

**Proposta:** Atualizar CLAUDE.md (e o agent doc) para o fluxo real useReportData → POST /api/metrics/batch + /api/filter-options

## `a1-dados-02` · ADR-0015 segue Proposed há 2+ meses embora seja o canon implementado em todo o código

| Campo | Valor |
|---|---|
| Origem | #12 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / ativo |
| Tipo / Lente | doc-drift / L4 |
| Estágio | E2 |
| Componente | adrs/decisions/0015-semantic-layer-data-contract.md |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `adr-0015-status-proposed` · ADR: ADR-0015 |

**Evidência:** adrs/decisions/0015-semantic-layer-data-contract.md:4 (status: Proposed) e :16-24 ('Aguarda revisão antes de migrar para Accepted', desde 2026-05-11); implementação viva: src/shared/schemas/data-contract.ts, app/api/data-contracts/route.ts + entities/attributes, app/api/relations/route.ts, src/shared/lib/metrics/resolve-metric.ts; CLAUDE.md:24-27 declara 'ADRs 0001-0014' como fonte canônica — a 0015 nem entra no índice citado

Todo o estágio E2 (dataContracts/entities/attributes/relations, resolvers, rotas) implementa a ADR-0015, mas a decisão formalmente 'aguarda revisão'. Como specs devem referenciar ADRs aceitas e 'a ADR vence' em divergência, um canon de-facto em Proposed cria ambiguidade de governança.

**Proposta:** Promover ADR-0015 a Accepted (registrando divergências reais como #21) e citá-la no CLAUDE.md

## `a1-dados-03` · Convivem dois resolveColumn: semântico fail-loud vs legado que devolve o nome em qualquer ausência

| Campo | Valor |
|---|---|
| Origem | #13 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | inconsistencia / L6 |
| Estágio | E1 |
| Componente | src/shared/lib/bigquery/schema-resolver.ts vs src/shared/lib/metrics/resolve-metric.ts |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `dois-resolvecolumn-semanticas-divergentes` |

**Evidência:** schema-resolver.ts:22-34 (resolveColumn legado: retorna o próprio field p/ schema ausente, tabela ausente OU key ausente — soft em qualquer ausência) vs resolve-metric.ts:71-107 (resolveColumn semântico: cliente migrado sem mapping → MetricResolutionError :94-99; fallback só p/ binding vazio, com console.warn :101-106); consumidores vivos do legado: src/shared/lib/bigquery/queries.ts:2,18-19,110-116 (queryFilterOptions e queryBenchmarkAggregated)

Ambos os caminhos rodam em produção: o legado serve /api/filter-options e /api/benchmark; o semântico serve toda execução de métrica. Para um cliente migrado com coluna renomeada, o mesmo attribute pode resolver fail-loud num endpoint e virar coluna inexistente/errada no outro. Não bloqueia DoD (o caminho /g usa só o semântico) → média.

**Proposta:** Consolidar num único resolver (ou renomear o legado p/ resolveColumnLegacy com deprecation), migrando queries.ts para o caminho semântico

## `a1-dados-04` · /api/filter-options é caminho pré-ADR-0015: schema legado, tabela contratos fixa e BQ client por env

| Campo | Valor |
|---|---|
| Origem | #15 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | inconsistencia / L6 |
| Estágio | E1 (afeta: E6, E9) |
| Componente | /api/filter-options + src/shared/lib/bigquery/queries.ts |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `filter-options-caminho-pre-semantica` |

**Evidência:** #15: app/api/filter-options/route.ts:58 (lê clientDoc.data.schema — campo legado, não productBindings) + queries.ts:23,30 (formatTableRef(dataset,'contratos') hard-coded na tabela contratos); #16: queries.ts:16 (getBigQueryClient() default por env) + client.ts:35-44 (BIGQUERY_PROJECT_ID/GOOGLE_CLOUD_PROJECT), enquanto métricas usam getBigQueryClientFor(dataSourceId) (execute-metric.ts:247-251); #14: app/api/metrics/filter-values/route.ts:74-81 (422 fail-loud sem mapping) vs queries.ts:18 (fallback '?? data_base_report') — semânticas opostas p/ a mesma finalidade

Causa-raiz única cobre as hipóteses #14, #15 e #16 (todas CONFIRMADAS): a rota inteira é o remanescente pré-camada-semântica. #15 confirmado — só funciona p/ clientes com campo legado 'schema' ou por sorte de identity-mapping (Vila Rosa: schema ausente → resolveColumn legado devolve o nome canônico, e vila_rosa_monitor.contratos tem data_base_report/projeto). #16 confirmado — se BIGQUERY_PROJECT_ID divergir do DataSource, filtros consultam projeto diferente da execução de métricas; agravante: match-client-dataset.ts:17 aceita 'dataSourceId.datasetId' como dataset, conflando id de doc Firestore com projectId GCP (funciona só porque o doc 'bq-data-wh' tem id igual ao projeto). #14 confirmado — contrato de erro oposto entre os dois endpoints de valores de filtro. Sobre a questão-aberta-1 do spec §8: o produto liquid-play declara as 10 rotas de páginas padrão (seed-liquid-play-contracts.mjs:215-226,405-409) e vila-rosa assina liquid-play (seed-vila-rosa-client.mjs:216), então a superfície padrão EXISTE para o cliente; porém as asserções do DoD-1 (§3) exigem apenas o fluxo /g (que usa filter-values, product-aware) — mantido como dívida (dod: nenhum), subindo a blocker só se o rollout Vila Rosa conceder páginas padrão.

**Proposta:** Migrar /api/filter-options para productBindings + DataSource (getBigQueryClientFor) ou aposentá-la em favor de metrics/filter-values nas páginas padrão

## `a1-dados-05` · As 2 Relations seedadas não são consumidas por nenhuma métrica — config sem consumidor

| Campo | Valor |
|---|---|
| Origem | #17 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / config / latente |
| Tipo / Lente | codigo-morto / L4 |
| Estágio | E2 |
| Componente | relations/ (fluxo-caixa-contratos, contratos-mapa-de-vendas) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `relations-seedadas-sem-consumidor` · dep: bloqueado-por: derived-join-sem-qualificacao, relationdoc-sem-cast (as relations só ganham consumidor quando o resolver derived suportar alias e cast) |

**Evidência:** scripts/seed-covenants-v2-relations.mjs:102-125 (as 2 relations); scripts/metrics/covenants-v2.mjs:15-47 (header: nenhuma métrica do catálogo usa kind:'derived'; joins ficaram em kind:'sql' com alias manual); grep 'fluxo-caixa-contratos|contratos-mapa-de-vendas' fora de docs/ → só o seed e comentários; grep relationId em scripts/ → só o validador do seed (seed-covenants-v2-metrics.mjs:80); derived vivos (play-dashboard.mjs:30-40, play-elegibilidade.mjs:36-46) usam joins=[]

Confirmado por grep de consumidores vazio. As rotas metrics/batch e metrics/[id]/data até carregam a coleção relations (batch/route.ts:86) quando há recipe derived com joins, mas nenhum doc de métrica ativa referencia esses ids. Latente: risco zero hoje; vira armadilha se alguém montar uma derived confiando nelas (cai em #18/#22).

**Proposta:** Documentar como config aspiracional (ou remover) até o resolver derived suportar alias/cast; não seedar relations à frente da capacidade do resolver

## `a1-dados-06` · resolveDerivedMetric monta JOIN ON col=col sem qualificar tabela — colunas homônimas quebram

| Campo | Valor |
|---|---|
| Origem | #18 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / latente |
| Tipo / Lente | bug / L6 |
| Estágio | E4 (afeta: E2) |
| Componente | resolveDerivedMetric (src/shared/lib/metrics/resolve-metric.ts) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `derived-join-sem-qualificacao` · dep: blocks: relations-seedadas-sem-consumidor, relationdoc-sem-cast |

**Evidência:** resolve-metric.ts:562 (joinClauses.push(`JOIN ${table(newCe)} ON ${col(rel.leftRef)} = ${col(rel.rightRef)}`) — col() devolve só a coluna quoted, sem alias/tabela; FROM e JOIN também não recebem alias :620-630); repro documentada contra BQ real: scripts/metrics/covenants-v2.mjs:24-29 ('Column name id_contrato is ambiguous' — fluxo_caixa e contratos compartilham id_contrato/data_base_report/status_contrato/empresa/projeto); contorno vivo: joins em kind:'sql' com alias manual (covenants-v2.mjs:550-553)

Input disparador: qualquer métrica derived cujo par de entidades compartilhe nome de coluna — que é o caso das DUAS relations seedadas (id_contrato/unidade dos dois lados). Estado latente porque nenhum derived com joins existe no catálogo (contornado via kind:'sql'), mas inviabiliza a feature derived cross-entidade no domínio (colunas repetidas em quase todas as entidades). Já anotado como dívida no spec §8; confirmo do código.

**Proposta:** Gerar aliases determinísticos por entidade no FROM/JOIN e qualificar todas as refs (col/timeRef/groupBy/filtros) no resolver derived

## `a1-dados-07` · Joins com liquid_aux.* usam projeto GCP literal bq-data-wh dentro das recipes

| Campo | Valor |
|---|---|
| Origem | #19 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | config-dados / L2 |
| Estágio | E1 (afeta: E4) |
| Componente | recipes covenants.transacoes_* / liquid_aux |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `liquid-aux-literal-hardcoded` |

**Evidência:** scripts/metrics/covenants-v2.mjs:1192,1212,1237,1255,1284-1285 (LEFT JOIN `bq-data-wh.liquid_aux.ba_pluggy_categorias`/`ba_bancos` literais nos templates sql, gravados como docs de métrica); decisão declarada no header :64-67; contraste: {entity} resolve projeto via DataSource (resolve-metric.ts:441-443 + tableRef :130-144, projectId de execute-metric.ts:247-250); scripts/bq-load-aux-tables.ts:47-50,163-169 (liquid_aux criado na location de vila_rosa_covenants — cliente em outra location quebra o join mesmo em outro projeto igual)

Confirmado: 6 sites literais. Contraria o isolamento por DataSource — um cliente cujo DataSource aponte p/ outro projeto/location falharia nos joins de transações (cross-project exige grant; cross-location falha sempre). Latente: todos os clientes atuais estão em bq-data-wh/mesma location.

**Proposta:** Introduzir placeholder resolvível ({aux:ba_bancos} → projeto do DataSource do binding, ou DataSource dedicado p/ liquid_aux) em vez de literal nos templates

## `a1-dados-08` · Pré-checagem de cobertura (missing[]) é pulada para recipes sql — 422 genérico por ref

| Campo | Valor |
|---|---|
| Origem | #20 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L5 |
| Estágio | E4 (afeta: E2) |
| Componente | executeMetric (src/shared/lib/metrics/execute-metric.ts) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `coverage-precheck-pula-sql` |

**Evidência:** execute-metric.ts:240 (`if (metricContractId && metric.recipe.kind !== 'sql')` — collectBindingGaps só roda p/ aggregation) vs :241-244 (422 com missing[] estruturado); caminho de falha p/ sql: resolve-metric.ts:94-99 (MetricResolutionError por ref) → execute-metric.ts:255 (fail 422 só com a mensagem, sem missing[]); grep positivo: o 422 amigável existe p/ aggregation no mesmo arquivo; negativo: ausente p/ sql (a maioria do catálogo covenants v2 é kind:'sql')

Confirmado. Efeito é de observabilidade/diagnóstico: cliente sem cobertura recebe erro por-attribute em vez da lista completa missing[] que a Admin UI/onboarding usa para diagnosticar gap de binding. Não bloqueia DoD-1 #9 (o 422 continua observável e a página degrada).

**Proposta:** Rodar collectBindingGaps também p/ kind:'sql' (requires[] existe e é validado no POST), mantendo o resolver como segunda linha

## `a1-dados-09` · Vila Rosa usa contractRef=productId, divergindo da premissa 'contract único canonical' do MVP

| Campo | Valor |
|---|---|
| Origem | #21 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L4 |
| Estágio | E2 |
| Componente | clients/vila-rosa productBindings + comentários de schema |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `contractref-productid-vs-premissa-canonical` · ADR: ADR-0015 |

**Evidência:** seed-vila-rosa-client.mjs:221,235 (contractRef: 'liquid-play'/'liquid-play-plus' = productId); premissa desatualizada: src/shared/schemas/data-contract.ts:17-19 ('MVP: um único contract canônico') e src/shared/schemas/metric.ts:29-30 ('Em modo single-contract, contractId é sempre canonical'); decisão justificada no header do seed :17-46 (usar canonical quebraria 422 em execute-metric.ts:210, molde = Galli)

Confirmado como drift de documentação, não bug: o schema já suporta multi-contract e a decisão está registrada no seed. O custo é a premissa stale nos comentários canônicos, que induz quem seguir 'canonical' a criar métrica que 422a para Galli/Vila Rosa.

**Proposta:** Atualizar comentários de data-contract.ts/metric.ts e a ADR-0015 (§Single vs Multi-Contract) para refletir o modo multi-contract já em produção

## `a1-dados-10` · Relation exige CAST INT64→STRING (unidade) que o RelationDoc não sabe expressar

| Campo | Valor |
|---|---|
| Origem | #22 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | config-dados / L6 |
| Estágio | E2 |
| Componente | relations/contratos-mapa-de-vendas + RelationDoc |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `relationdoc-sem-cast` · dep: relacionado: derived-join-sem-qualificacao (mesmo resolver precisa de alias + cast p/ a relation ser executável) · ADR: ADR-0015 |

**Evidência:** declarado vs físico: seed-vila-rosa-client.mjs:104 (contratos.unidade INT64) vs :161 (mapa_de_vendas.unidade STRING); src/shared/schemas/relation.ts:18-28 (RelationDoc: leftRef/rightRef/cardinality — nenhum campo de transformação/cast); seed-covenants-v2-relations.mjs:114-124 (cast documentado apenas em texto de description); resolver sem hook: resolve-metric.ts:562 monta col = col cru

Confirmado. Qualquer derived via contratos-mapa-de-vendas geraria JOIN INT64=STRING (erro de tipo no BQ) mesmo depois de resolver a ambiguidade de #18. Latente: nenhuma métrica usa a relation hoje (join de permuta/garantia foi resolvido só sobre mapa_de_vendas). Classificado correção-de-dado porque a mitigação errada (cast implícito silencioso) produziria matches errados.

**Proposta:** Estender RelationDoc com transformação opcional por lado (ex.: leftCast/'expression') e ensinar o resolver derived a aplicá-la

## `a1-dados-11` · Tipo do attribute no contract pode divergir da coluna física e nada detecta em runtime

| Campo | Valor |
|---|---|
| Origem | #23 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | config-dados / L6 |
| Estágio | E2 (afeta: E6) |
| Componente | schemaBindings (name→coluna) + attributes.type |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `tipo-contract-vs-fisico-nao-validado` |

**Evidência:** declarado vs físico: seed-liquid-play-contracts.mjs:83 (contract contratos.private_area FLOAT64) vs seed-vila-rosa-client.mjs:107 (físico Vila Rosa: private_area STRING); segundo caso na direção oposta: seed-liquid-play-contracts.mjs:111 (contract unidade STRING) vs seed-vila-rosa-client.mjs:104 (físico INT64); binding não carrega tipo: buildIdentitySchemaBindings (seed-vila-rosa-client.mjs:199-205) e resolveColumn (resolve-metric.ts:76-84) só mapeiam/quotam nome; coverage checa só presença (execute-metric.ts:240-245); schema-detect v2 lê tipos do INFORMATION_SCHEMA mas só p/ prompt do Gemini (schema-detect/v2/route.ts:115-121,153-175), sem diff vs contract

Confirmado nos dois sentidos (private_area FLOAT64→STRING; unidade STRING→INT64). Uma futura métrica SUM({contratos.private_area}) p/ Vila Rosa falharia (ou, com SAFE_CAST adicionado às cegas, somaria lixo). O seed v2 do contract até detecta divergência ao estender atributos (seed-liquid-play-plus-v2-contract.mjs:329-336), provando que a checagem é viável — só não existe no caminho runtime/Admin UI.

**Proposta:** Validar tipo físico vs attributes.type no schema-detect/coverage (warning na gravação do binding) — o INFORMATION_SCHEMA já é consultado no fluxo

## `a1-dados-12` · requires multi-contract só gera warning, mas execução roteia silenciosamente pelo requires[0]

| Campo | Valor |
|---|---|
| Origem | #24 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 (afeta: E2) |
| Componente | POST /api/metrics + executeMetric |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `requires-multicontract-warning-only` |

**Evidência:** app/api/metrics/route.ts:97-109 (collectMultiContractWarnings — 'Nunca bloqueia (sem 422)') e :330-339 (vira warnings no 200); execução single-contract usa só o primeiro: execute-metric.ts:210 (`const metricContractId = metric.requires[0]?.split('.')[0]`) → roteia dataset por esse contrato :216-224

Confirmado. Uma métrica sql/aggregation com requires espalhado por 2 contracts seria executada contra o dataset do primeiro contract, com refs do segundo resolvendo por fallback/erro — dado potencialmente errado sem sinal ao usuário (o warning só sai no console do POST). Latente: catálogo atual não tem esse caso (checado nos catálogos covenants-v2/play).

**Proposta:** Promover o warning a 422 para recipes não-derived com requires em >1 contract (derived continua sendo o caminho multi-contract legítimo)

## `a1-dados-13` · TABLES/DEFAULT_DATASET legados seguem exportados coexistindo com roteamento por DataSource

| Campo | Valor |
|---|---|
| Origem | #25 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / config / latente |
| Tipo / Lente | inconsistencia / L4 |
| Estágio | E1 (afeta: E10) |
| Componente | src/shared/lib/bigquery/client.ts |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `constantes-legadas-client-bigquery` |

**Evidência:** client.ts:82-92 (DEFAULT_DATASET='liquid_dataviz' via env, TABLES {contratos,pagamentos,fluxo_caixa} hard-coded) e :100-119 (parseDatasetRef/formatTableRef marcados 'Retrocompat'); consumidores vivos: queries.ts:1,23,30 (filter-options/benchmark) e ~20 tools de ai-agents (decompose-*.ts, bqml-utils.ts etc. via parseDatasetRef+getBigQueryClient) — não é código morto

Confirmado como coexistência documentada (comentários 'Retrocompat'), não dead code. Severidade baixa mantida (ajuste justificado): não há caminho de dado errado hoje — env aponta p/ o mesmo projeto — e o custo é de manutenção/confusão sobre fonte de verdade, alinhado à Sev da doc.

**Proposta:** Marcar @deprecated com apontador p/ o caminho semântico e planejar migração dos consumidores (queries.ts e tools de IA)

## `a1-dados-14` · Update via POST com merge:false apaga createdAt em contracts, entities, attributes, metrics, products

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / ativo |
| Tipo / Lente | bug / L1 |
| Estágio | E2 (afeta: E3, E4) |
| Componente | POST /api/data-contracts, /entities, /attributes (tb metrics e products) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `merge-false-perde-createdat` |

**Evidência:** app/api/data-contracts/route.ts:82-89 (set com merge:false e createdAt incluído só quando !existing.exists — em update o doc inteiro é substituído SEM createdAt, apagando o campo); mesmo padrão em app/api/data-contracts/[id]/entities/route.ts:106-113, .../attributes/route.ts:115-122, app/api/metrics/route.ts:343-351 e app/api/products/route.ts:151; contraste: data-sources/route.ts:83-90 e relations/route.ts:39-50 usam merge:true (preservam); o invariante desejado está provado em app/api/metrics/rename/__tests__/route.test.ts:152 ('createdAt preservado')

Trace: POST de edição de um doc existente → ref.set(payload sem createdAt, {merge:false}) → Firestore substitui o documento inteiro → createdAt deixa de existir. Input disparador: qualquer edição pela Admin UI de contract/entity/attribute/métrica/produto já existente. Mesma causa-raiz do item 'createdAt zerado por merge:false' do WS-2 (clients), aqui confirmada nas rotas de E2/E3/E4. Efeito é perda de metadado de auditoria (round-trip Admin UI ≠ seed), não perda de conteúdo.

**Proposta:** Preservar createdAt no update (ler do doc existente e reescrever, mantendo merge:false p/ limpar campos órfãos) — padronizar entre as rotas irmãs

## `a1-dados-15` · Cache de cliente BigQuery por DataSource nunca é invalidado — editar projectId deixa cliente stale

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | bug / L1 |
| Estágio | E1 |
| Componente | getBigQueryClientFor (src/shared/lib/bigquery/client.ts) + POST/DELETE /api/data-sources |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `bq-client-cache-sem-invalidacao` |

**Evidência:** client.ts:17,61-63,77-78 (Map 'clients' por dataSourceId, sem TTL e sem função de invalidação em todo o arquivo); app/api/data-sources/route.ts:92,111 invalida apenas o cache do repo (src/shared/repositories/data-source-repo.ts:33-36, TTL 5min); call-path do bug: admin edita projectId do dataSource → executeMetric → getBigQueryClientFor (execute-metric.ts:251) → client.ts:62-63 devolve cliente construído com o projectId ANTIGO até o processo reiniciar

Input disparador: POST /api/data-sources alterando projectId/location de um dataSource existente com instância quente. As refs de tabela usam o projectId fresco (repo com TTL), mas o JOB roda no projeto/location do cliente stale — falha 403/404 ou job faturado no projeto errado, de forma não determinística por instância. Latente porque dataSources raramente são editados (hoje só bq-data-wh).

**Proposta:** Exportar invalidateBigQueryClient(id) chamada junto de invalidateDataSourceCache, ou aplicar o mesmo TTL de 5min do repo ao Map de clients

## `a1-dados-16` · POST /api/relations aceita refs para contracts/entities/attributes inexistentes (só valida formato)

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L1 |
| Estágio | E2 |
| Componente | POST/DELETE /api/relations |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `relations-sem-validacao-referencial` |

**Evidência:** app/api/relations/route.ts:26-34 (POST valida só o FORMATO via RelationDoc/AttributeRef — metric.ts:33-39; nenhuma checagem de existência de contract/entity/attribute); teste comprova aceitar refs de contracts inexistentes: app/api/relations/__tests__/route.test.ts:77-89 (leftRef 'contratos.contratos.cliente_id' → 200 com db vazio); grep positivo — validação referencial existe nas superfícies irmãs: app/api/metrics/route.ts:48-68 (findInvalidRefs → 422) e scripts/seed-covenants-v2-relations.mjs:130-144,178-192 (refExists, aborta); bônus: DELETE :58-60 não valida id com Slug ('a/b' → throw do Firestore → 500) vs data-contracts/route.ts:107-108 (Slug → 400)

O seed é mais rigoroso que a API: pela rota, um admin cria relation órfã que só falha quando uma métrica derived tentar usá-la (MetricResolutionError em runtime, resolve-metric.ts:547-563). Fail-loud tardio e sem diagnóstico na escrita — contrário ao padrão fail-loud-na-escrita do POST /api/metrics.

**Proposta:** Reusar a checagem de existência de refs (padrão findInvalidRefs) no POST de relations → 422; validar id com Slug no DELETE

## `a1-dados-17` · Deletar entity (ou attribute hard) não checa métricas dependentes — só o contract-delete checa

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | inconsistencia / L1 |
| Estágio | E2 |
| Componente | DELETE /api/data-contracts/[id]/entities/[entityId] e .../attributes?hard=true |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `delete-entity-attribute-sem-guard-de-dependencia` |

**Evidência:** guard existe no hard-delete de contract: app/api/data-contracts/route.ts:119-138 (422 + dependents se métrica ativa referencia) e no de métrica: app/api/metrics/route.ts:394-411; ausente no DELETE de entity: app/api/data-contracts/[id]/entities/[entityId]/route.ts:44-74 (hard cascade sem checar metrics; comentário :15-19 admite 'métricas passam a falhar fail-loud... recomendado revisar antes') e no hard-delete de attribute: attributes/route.ts:147,154-157; ambos alcançáveis pela Admin UI: src/features/admin/model/useAdminEntities.ts:66 e useAdminAttributes.ts:107

Os dois sites lado a lado, alcançáveis pelo mesmo tipo de input (delete admin): apagar dataContracts/liquid-play inteiro é bloqueado com 422+dependents, mas apagar só a entity 'contratos' (que quebra exatamente as mesmas métricas covenants.*) passa direto e cascateia os attributes. A proteção anti-quebra é ilusória no nível intermediário. Ativo: um clique na Admin UI hoje derruba métricas em produção sem aviso (elas 422am em runtime).

**Proposta:** Aplicar o mesmo guard de prefixo de requires (data-contracts/route.ts:123-132) ao DELETE de entity e ao hard-delete de attribute

## `a1-dados-18` · CRUD de relations existe na API mas não tem superfície na Admin UI — gestão só via seed/curl

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / ativo |
| Tipo / Lente | lacuna / L4 |
| Estágio | E2 |
| Componente | Admin UI (relations) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `relations-sem-superficie-admin-ui` · dep: relacionado: relations-sem-validacao-referencial (a UI deveria nascer sobre uma API com validação referencial) |

**Evidência:** grep '/api/relations' em src/ = 0 consumidores (únicos hits: o próprio route e app/api/relations/__tests__/route.test.ts); grep positivo — o resto do E2 tem UI: src/features/admin/model/useContractSchema.ts:43-58, useAdminEntities.ts:29-66, useAdminAttributes.ts:29-107, EntityRefsPicker.tsx:89; as 2 relations existentes foram criadas por script (scripts/seed-covenants-v2-relations.mjs)

Grep de consumidores vazio no front. Contracts/entities/attributes são gerenciáveis pela Admin UI, mas o quarto recurso do estágio (relations) não — quebra a paridade seed↔Admin UI (mesma classe de gap do DoD-1 #1, embora relations não sejam pré-requisito de criação de cliente, por isso dod: nenhum).

**Proposta:** Adicionar painel de relations na Admin UI (listar/criar/deletar com picker de contract.entity.attribute), fechando a paridade seed↔UI do estágio E2

## `a1-dados-19` · Config global (projectIds GCP, contracts, relations) legível por qualquer usuário autenticado

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / seguranca / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E1 (afeta: E2, E8) |
| Componente | GET /api/data-sources, /api/data-contracts (+entities/attributes), /api/relations |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `config-global-legivel-por-qualquer-autenticado` |

**Evidência:** app/api/data-sources/route.ts:40-47 (GET devolve todos os docs — projectIds GCP — a qualquer email autenticado; único gate é verifyAuth :41-42, sem isAdminEmail/verifyClientAccess); idem data-contracts/route.ts:39-51, entities/route.ts:39-62, attributes/route.ts:61-76, relations/route.ts:13-19; conta órfã (clientAccess=[]) passa — nada além do email é checado; comentários declaram intenção ('leitura pede apenas usuário autenticado', data-sources/route.ts:16)

Cenário de ameaça: usuário externo do tenant A — ou conta autenticada órfã sem clientAccess — enumera todos os projetos GCP (dataSources), o vocabulário completo dos contracts (nomes de entidades/colunas) e a topologia de joins (relations). Prova de gate único: nenhuma dessas GETs invoca isAdminEmail/verifyClientAccess (código lido integralmente). Sem dado de cliente exposto — é disclosure de topologia/metadata. Severidade ajustada manualmente p/ média (regra daria alta p/ segurança+ativo): comportamento é intencional por comentário, conteúdo é config não-sensível de negócio e nenhum usuário externo existe ainda — tratar como defesa-em-profundidade junto do item 'admin global vs por-tenant' do WS-5.

**Proposta:** Restringir os GETs a admin (os consumidores conhecidos são todos telas admin: useContractSchema/EntityRefsPicker/ClientForm), ou escopar leitura por clientAccess

## `a1-dados-20` · Benchmark agrega apenas clientes em formato legado — novos clientes ficam fora silenciosamente

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L6 |
| Estágio | OPS (afeta: E1) |
| Componente | /api/benchmark (src/shared/lib/bigquery/benchmark-cache.ts) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `benchmark-agrega-so-formato-legado` |

**Evidência:** benchmark-cache.ts:18-25 (loadAllClients filtra `d.dataset && d.schema` — só clientes no formato legado entram no agregado); clientes productBindings-only ficam fora: vila-rosa não tem dataset nem schema (seed-vila-rosa-client.mjs:193,262-263) e galli tem dataset mas não schema (seed-liquid-play-contracts.mjs:264-269,461-465); o agregado usa o resolveColumn legado de queries.ts:98-117

Achado fora das minhas hipóteses, descoberto na superfície E1 (lib bigquery). À medida que clientes migram p/ productBindings, o 'Agregado anonimizado de carteiras Liquid' encolhe silenciosamente sem nenhum sinal — hoje já exclui galli e vila-rosa. Reportado como OPS (raia transversal do spec §4, onde /api/benchmark já é hipótese L2 aberta); este item é ortogonal ao scoping de tenant lá discutido.

**Proposta:** Estender loadAllClients p/ derivar dataset+mapping de productBindings/schemaBindings (ou declarar explicitamente que benchmark é legado-only)

## `a1-dados-21` · Todos os DataSources usam a mesma credencial de env; schema promete desacoplamento que não existe

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | lacuna / L2 |
| Estágio | E1 |
| Componente | DataSourceDoc + getBigQueryClientFor |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `datasource-sem-credencial-propria` |

**Evidência:** src/shared/schemas/data-source.ts:7-8 (comentário do schema promete 'isolar clientes em projetos GCP distintos sem acoplar credenciais a variáveis de ambiente') vs :21-28 (DataSourceDoc não tem campo de credencial) e src/shared/lib/bigquery/client.ts:75 (`if (process.env.BIGQUERY_CREDENTIALS) opts.keyFilename = ...` — a MESMA keyfile de env p/ todos os dataSources)

Confirmado por diff comentário-vs-código. O isolamento multi-projeto declarado só funciona se a única SA (BIGQUERY_CREDENTIALS) tiver acesso a todos os projetos — o que anula parte do benefício de isolar clientes em projetos distintos (a SA vira ponto único cross-tenant). Latente: hoje há um único projeto real (bq-data-wh).

**Proposta:** Ou adicionar credentialRef opcional ao DataSourceDoc (Secret Manager) ou corrigir o comentário do schema p/ 'uma SA com acesso a todos os projetos'

---

# a2-metricas — E4 Métricas & indicadores

> **Varredura (resumo do auditor):** Varrido alem das 13 hipoteses (todas confirmadas; razao novo:hipotese = 4:13): (1) as 5 rotas de app/api/metrics (route.ts CRUD+promote+delete, [id]/data, batch, filter-values, rename) linha a linha; (2) src/shared/lib/metrics/ completo (resolve-metric com os 3 kinds aggregation/sql/derived, execute-metric, coverage, authorize-metric, create-chat-metric, metric-id, ambient-filter, fetch-filter-values, parameterize nao aplicavel aqui); (3) gating: ownerClientId (anti-sequestro no POST preserva dono do doc existente — OK), authorizeMetricWrite (fail-closed, sem return true suspeito), metric-route-map estatico, verifyRouteAccess/verifyDatasetAccess no executeMetric (regressao OK); (4) injecao via tokens de filtro conferida ESTATICAMENTE — negativa: identificadores sempre via quoteIdentifier/safeIdentifier/safeDatasetRef (identifier.ts:15-81, regex estrito) e valores sempre em @params nomeados (resolve-metric.ts:156-224,394-434); attribute client-controlado passa por resolveColumn->quoteIdentifier; (5) checklist positivo: NODE_ENV — zero na superficie (bypass dev via isDevAuthBypassEnabled, off em prod por construcao, lista de regressao); literais GCP — 6 JOINs bq-data-wh.liquid_aux achados (finding aux-tables-literal-projeto); @deprecated importado — zero; zod presente em todas as rotas de escrita; tenant-check presente em todas as rotas de escrita (rename e admin-only). Anotados sem elevar a finding: [id]/data nao valida o param id com MetricId antes do doc() (id malformado vira 500 do catch em vez de 400); loadClientBindings descarta bindings invalidos silenciosamente (execute-metric.ts:62-67 — pode mascarar binding quebrado como 'nenhum dataset cobre'); DEFAULT_PAGE_FILTERS hardcoda contratos.data_base_report p/ templates sem filters (useReportData.ts:220-223). Teste executado: vitest run app/api/metrics/filter-values/route.test.ts (13 passed — confirma que a fixture contractRef=='transacoes' mascara o bug de dataset-matching). NAO coberto (fora do escopo E4 ou proibido): execucao real contra BigQuery/Firestore (SQL conferido estatico); /api/filter-options e /api/bigquery (E9/E1 — questao aberta do spec par. 8 sobre paginas padrao permanece com o dono); fluxo completo explore/canvas-chat que chama create-chat-metric (E9/E10 — a lib em si foi lida: ownerClientId=clientId correto, escrita direta sem passar pelo POST validador e best-effort declarado); verificacao dos docs Firestore de producao (seeds usados como proxy — memoria confirma seeds rodados em producao); save de dashboard-templates (E5).

## `a2-metricas-01` · filter-values busca dataset por contractRef==entidade; dropdowns /g do Vila Rosa dao 422

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | bug / L1 |
| Estágio | E4 (afeta: E9, E5) |
| Componente | /api/metrics/filter-values |
| DoD / Esforço | DoD-1 / P |
| Causa-raiz | `filter-values-contractref-entidade` · dep: Para o criterio DoD-1 completo no /g, soma-se a g-route-nao-concedivel (E8/WS-1); este achado e independente e afeta inclusive admins |

**Evidência:** app/api/metrics/filter-values/route.ts:49,61 (ds.contractRef === entityId, onde entityId = attribute.split('.')[0]); scripts/seed-vila-rosa-client.mjs:221,235 (contractRef real = 'liquid-play'/'liquid-play-plus'; entidade 'transacoes' pertence ao MONITOR_SCHEMA, linha 176); scripts/templates/covenants-v2-extrato-detalhado.template.mjs:63-65 (dropdowns declaram attribute 'transacoes.banco_codigo' etc.); src/widgets/page-filter-bar/ui/PageFilterBar.tsx:52 -> src/shared/lib/metrics/fetch-filter-values.ts:23 -> route.ts:61 -> 422 route.ts:67-71 -> PageFilterBar.tsx:57-63,101-103 (dropdown vazio + erro); contraste: src/shared/lib/metrics/execute-metric.ts:210-212 casa dataset por CONTRATO (requires[0]); app/api/metrics/filter-values/route.test.ts:58 (fixture contractRef:'transacoes' mascara o bug — 13 testes passam, vitest run executado nesta sessão)

A rota trata o primeiro segmento do attribute 2-part ('transacoes.banco_codigo' -> 'transacoes') como se fosse contractRef do dataset. No Vila Rosa (unico cliente com dropdowns G3), contractRef e 'liquid-play'/'liquid-play-plus' — nunca igual ao nome da entidade — entao find() falha para TODOS os 5 dropdowns declarados (banco/categoria/tipo em extrato-detalhado; banco/categoria em entradas-saidas) e a rota devolve 422 'Cliente nao cobre a entidade'. Input disparador: POST {clientId:'vila-rosa', productId:'liquid-play-plus', attribute:'transacoes.banco_codigo'}. O admin nao escapa (o bypass de admin e so no verifyClientAccess; a selecao de dataset falha igual). Os comentarios 'FIX Task 13 — dropdowns funcionais de ponta a ponta' (template linhas 11-16) cobriram o lado da APLICACAO do filtro (tokens {filter.banco:...} nas metricas, que roda via execute-metric e casa por contrato), mas o CARREGAMENTO das opcoes via filter-values nunca pode ter funcionado com o binding real. Bloqueia DoD-1 item 5 (aplicar filtros de pagina dropdown com sucesso observavel): funcional + ativo + bloqueia DoD -> alta.

**Proposta:** Selecionar o dataset procurando o binding cujo schemaBindings contem a key `attribute` (ou resolvendo o contrato da entidade via dataContracts), como faz execute-metric por requires[0]; corrigir a fixture do teste que codifica contrato==entidade

## `a2-metricas-02` · Falha de metrica vira bloco vazio: batch mascara erro e consumidores descartam error do hook

| Campo | Valor |
|---|---|
| Origem | #37 · Δ sev: doc: media -> codigo: alta |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | lacuna / L5 |
| Estágio | E4 (afeta: E9) |
| Componente | /api/metrics/batch + /g (useReportData) |
| DoD / Esforço | DoD-1 / M |
| Causa-raiz | `erro-metrica-invisivel-ui` |

**Evidência:** src/shared/lib/metrics/execute-metric.ts:254-257 (erro BQ/Firestore vira 500 'Erro ao executar metrica' — mascaramento por design, correto p/ nao vazar SQL); src/shared/hooks/useReportData.ts:92-99 (falha por-metrica vira rows vazias + console.error); src/pages/report/ui/ReportPage.tsx:99 e src/pages/dynamic/ui/RouteTemplatePage.tsx:57 (ambos consumidores DESCARTAM o campo `error` do hook); grep positivo: BlockError existe e e usado no explore (src/pages/explore/ui/CanvasBlockRenderer.tsx:12,24); grep negativo: nenhum uso de BlockError no caminho report/dynamic

Confirmado e mais forte que a observacao da doc: alem do mascaramento por-metrica (batch devolve HTTP 200 com fail por metrica; useReportData converte em rows vazias), o estado de erro top-level que o hook JA expoe e descartado pelos dois unicos consumidores (ReportPage e RouteTemplatePage destructuram apenas populatedBlockMap/loading). KPI mantem placeholder e grafico fica vazio — indistinguivel de 'sem dados'. Severidade derivada alta porque bloqueia DoD-1 item 9 ('metrica 422/500 tem comportamento observavel'): hoje o unico sinal e console.error, invisivel ao usuario final. O mascaramento do 500 em si (nao vazar SQL/topologia) esta correto e deve ser preservado.

**Proposta:** Propagar MetricExecResult.ok=false ate o bloco (reusar BlockError do explore) e renderizar o `error` top-level do hook nos dois consumidores; manter a mensagem generica do 500 (seguranca) mas sinalizar visualmente o estado de erro

## `a2-metricas-03` · Rename nao re-aponta blockMap.metricId de templates/reports — blocos 404 apos rename

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | bug / L1 |
| Estágio | E4 (afeta: E5, E7) |
| Componente | /api/metrics/rename |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `rename-blockmap-orfao` |

**Evidência:** app/api/metrics/rename/route.ts:99-102 (queries so em products e dashboardTemplates por metricRefs) e 127-133 (tx atualiza apenas metricRefs); scripts/templates/covenants-v2-extrato-detalhado.template.mjs:43 (blockMap embute metricId 'covenants.extrato_table'); scripts/seed-vila-rosa-reports.mjs:105 (reports deep-copiam blockMap do template); src/shared/hooks/useReportData.ts:253-255,264-266 (front le block.metricId e sparklineMetricId) -> app/api/metrics/batch/route.ts:72-74 (id antigo deletado -> 404 por metrica) -> useReportData.ts:95-98 (bloco vazio)

O endpoint 'rename atomico' (docstring, rename/route.ts:13-27) foi criado justamente para nao deixar refs orfas, mas so re-aponta os arrays metricRefs de products/dashboardTemplates. As referencias executaveis reais do frontend sao blockMap.*.metricId (e sparklineMetricId) em dashboardTemplates E em reports (colecao clients/{id}/groups/*/reports/*, que nem e consultada). Input disparador: POST /api/metrics/rename {oldId:'covenants.extrato_table', newId:'covenants.extrato_full'} -> doc antigo deletado (route.ts:136) -> todo bloco que o referencia passa a 404 no batch -> pagina renderiza vazia (agravado por erro-metrica-invisivel-ui). Nota menor no mesmo endpoint: rename e admin-only (route.ts:61) enquanto POST/DELETE delegam ao dono via authorizeMetricWrite — cliente dono nao consegue renomear a propria metrica (assimetria de permissao, provavelmente aceitavel).

**Proposta:** Na mesma transacao (ou passo subsequente idempotente), varrer dashboardTemplates.blockMap e clients/*/groups/*/reports/*.blockMap re-apontando metricId e sparklineMetricId; alternativamente bloquear rename quando ha blockMaps referenciando (paridade com o guard de hard-delete)

## `a2-metricas-04` · metric.unit nao dirige formatacao; format do bloco decide e divergencia fica silenciosa

| Campo | Valor |
|---|---|
| Origem | #26 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 (afeta: E5, E9) |
| Componente | /g (useReportData.formatValue) + catalogo metrics |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `unit-nao-dirige-formatacao` |

**Evidência:** src/shared/schemas/metric.ts:186-187 ('Persistido para back-compat — unit canonica vive no Attribute'; sem uso funcional); src/shared/hooks/useReportData.ts:28-51 (formatValue recebe so block.format/decimals/suffix) e 107-118 (KPI usa kpiBlock.format, nunca metric.unit); grep: nenhum consumidor de metric.unit no caminho de renderizacao

Confirmado sem drift de linha: unit e metadado back-compat (metric.ts:186-187) e a formatacao e 100% decidida pelo bloco de canvas. Um bloco que declare format:number para uma metrica unit:'%' renderiza silenciosamente errado. Estado latente: os templates Vila Rosa foram reconciliados manualmente (commit e05255b 'descricoes reconciliadas e decimais'). Correcao-de-dado latente -> media (igual doc). Relacionado a percent-escala-convencao-implicita (#27) — a proposta de validacao cobre ambos.

**Proposta:** Validar (no save do template/report e/ou em lint de seed) que block.format e coerente com metric.unit ('%'->percent, 'BRL'->currency), ou derivar o default do format a partir da unit quando o bloco nao declara

## `a2-metricas-05` · Convencao percent 0-1 depende do format do bloco; format:number renderiza razao como 0

| Campo | Valor |
|---|---|
| Origem | #27 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 (afeta: E5, E9) |
| Componente | /g (useReportData.formatValue) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `percent-escala-convencao-implicita` · dep: Mesma direcao de correcao de unit-nao-dirige-formatacao |

**Evidência:** src/shared/hooks/useReportData.ts:41-43 (case 'percent': formatPercent(value * 100, decimals) — x100 so nesse branch) e 44-45 (case 'number': formatNumber sem escala — 0.0066 com decimals default 0 vira '0'); scripts/metrics/covenants-v2.mjs:57-58 (decisao: catalogo emite razao 0-1, fronteira de apresentacao no front)

Confirmado: o x100 acontece exclusivamente no branch format:'percent' de formatValue. A convencao 'catalogo emite razao 0-1' e um acoplamento implicito entre autor de metrica e autor de bloco, sem nenhuma validacao — declarar format:number (ou omitir format, caindo no default String(value)) exibe a razao crua. Latente: os blocos covenants declaram percent corretamente hoje. Correcao-de-dado latente -> media (igual doc).

**Proposta:** Mesma frente de unit-nao-dirige-formatacao: validar/derivar format a partir de metric.unit=='%' e documentar a convencao 0-1 como contrato do catalogo (hoje vive so em comentarios)

## `a2-metricas-06` · Coverage pre-check pulado p/ recipes sql e derived: 422 por coluna, sem missing[] agregado

| Campo | Valor |
|---|---|
| Origem | #28 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L5 |
| Estágio | E4 (afeta: E6) |
| Componente | /api/metrics/[id]/data, /api/metrics/batch (executeMetric) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `coverage-precheck-so-aggregation` |

**Evidência:** src/shared/lib/metrics/execute-metric.ts:240-245 (collectBindingGaps roda apenas `if (metricContractId && metric.recipe.kind !== 'sql')`); src/shared/lib/metrics/resolve-metric.ts:94-99 (sql falha coluna-a-coluna via resolveColumn) -> execute-metric.ts:255 (fail 422 com err.message, sem missing[]); grep positivo: coverage.ts:21-40 existe e agrega TODAS as lacunas; caminho derived (execute-metric.ts:157-207) tambem nao chama collectBindingGaps

Confirmado com nuance: a doc diz '422 generico', mas o 422 carrega a mensagem especifica do MetricResolutionError da PRIMEIRA coluna que falha (execute-metric.ts:255) — o que falta e o diagnostico agregado missing[] que aggregation recebe (uma lacuna por request em vez de todas de uma vez). Como a maioria do catalogo covenants.* e kind:'sql' (64 ids), o onboarding de um cliente com schemaBindings incompleto vira um loop de tentativa-erro coluna-a-coluna. Vale tambem para derived, que so checa cobertura de CONTRATO (nao de atributo).

**Proposta:** Rodar collectBindingGaps tambem para sql (extraindo refs {entity.attr} do template, como ja faz collectRecipeRefWarnings no POST /api/metrics) e para derived (por contrato), devolvendo missing[] agregado

## `a2-metricas-07` · resolveDerivedMetric monta JOIN sem alias — colunas homonimas quebram (ambiguous)

| Campo | Valor |
|---|---|
| Origem | #29 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / latente |
| Tipo / Lente | bug / L6 |
| Estágio | E4 |
| Componente | resolveDerivedMetric (src/shared/lib/metrics/resolve-metric.ts) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `derived-join-sem-alias` · dep: Mesma frente de derived-filter-expressividade (#35) |

**Evidência:** src/shared/lib/metrics/resolve-metric.ts:562 (`JOIN ${table(newCe)} ON ${col(rel.leftRef)} = ${col(rel.rightRef)}` — col() retorna resolveColumn:83-85, identifier em backtick SEM qualificacao de tabela; SELECT/WHERE/GROUP BY idem, linhas 569-611); scripts/metrics/covenants-v2.mjs:20-47 (repro documentado contra BQ real: 'Column name id_contrato is ambiguous'; os 3 joins do inventario foram reescritos como sql)

Confirmado no codigo atual (linha 562 bate com a ref da doc, sem drift). Colunas homonimas sao a regra no dominio (id_contrato, data_base_report, empresa, projeto, status_contrato aparecem em quase todas as entidades), tornando derived inutilizavel para joins reais. Latente: contornado no Vila Rosa via kind:'sql' com alias manual; o proprio spec par. 8 registra como divida tecnica fora desta release (dod nenhum). Input disparador: qualquer derived com join entre entidades que compartilham nome de coluna usado em ON/term/groupBy.

**Proposta:** Gerar alias por entidade no escopo (t0, t1, ...) e qualificar toda coluna resolvida pelo alias da sua entidade (col() precisa receber o contexto contractId.entity -> alias)

## `a2-metricas-08` · Recipe aggregation com groupBy so emite LONG; stacked-bar exige pivot manual em sql

| Campo | Valor |
|---|---|
| Origem | #30 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 (afeta: E5) |
| Componente | resolveAggregationRecipe (resolve-metric.ts) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `aggregation-sem-pivot` |

**Evidência:** src/shared/lib/metrics/resolve-metric.ts:325-332 (cada groupByAttribute vira coluna labelled + GROUP BY — formato LONG, sem pivot) e 344-345 (value unico); scripts/metrics/covenants-v2.mjs:369-385 (FIX Task 13: 4 metricas reescritas como sql com pivot manual SUM(IF(...)) por serem incompativeis com stacked-bar)

Confirmado. Derivacao pela regra do par. 5 daria media (funcional sem bloqueio de DoD), mas ajusto manualmente para baixa (igual doc): e limitacao de capacidade com workaround canonico ja adotado em 100% dos casos reais (pivot manual em sql, padrao repetido de play-elegibilidade.mjs:125-170), nenhuma superficie ativa quebrada, e o custo e so a reescrita de recipes futuros.

**Proposta:** Ou adicionar opcao de pivot (WIDE) ao recipe aggregation, ou fazer o adapter do front pivotar LONG->WIDE quando o bloco declara multiplas dataKeys — decidir e documentar qual lado e o dono do shape

## `a2-metricas-09` · Duas semanticas de snapshot: covenants pina MAX ignorando seletor; base usa {filter.snapshot}

| Campo | Valor |
|---|---|
| Origem | #31 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | inconsistencia / L6 |
| Estágio | E4 (afeta: E9, E5) |
| Componente | catalogos de metricas (covenants.* vs play.*) + /g |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `snapshot-semantica-dupla` |

**Evidência:** scripts/metrics/covenants-v2.mjs:111-125 (snapshotKpi/pinClause: WHERE data_base_report = (SELECT MAX(...)) — pin fixo, imune ao page filter) LADO A LADO com scripts/metrics/play-elegibilidade.mjs:20 (snapshotFilter value:'filter.snapshot') e 61-70 (template com {filter.snapshot} — respeita a selecao do usuario); ambos alcancaveis pelo MESMO input (usuario muda o periodo na pagina): useReportData.ts:314-315 envia pageFilters.snapshot para todas as metricas do batch

Confirmado. O pin-MAX dos covenants e decisao documentada (covenants-v2.mjs decisao 3, padrao de patch-covenants-snapshot-pin.mjs), mas o efeito composto no /g e inconsistente para o usuario: ao mudar o periodo, as series (date_range) reagem e os KPIs pinados nao — sem nenhum sinal de que estao pinados no ultimo snapshot. Inconsistencia funcional ativa entre dois catalogos vivos servidos pela mesma UI de filtros -> media (igual doc).

**Proposta:** Decidir a semantica canonica por tipo de KPI e torna-la observavel: se pin-MAX e intencional (compliance no snapshot mais recente), o bloco deve exibir a data do snapshot pinado; caso contrario, migrar os KPIs covenants para {filter.snapshot}

## `a2-metricas-10` · Filtro de pagina so aplica se o template sql tiver o token; omissao ignora filtro em silencio

| Campo | Valor |
|---|---|
| Origem | #32 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 (afeta: E5) |
| Componente | resolveSqlRecipe (resolve-metric.ts) + templates /g |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `sql-tokens-filtro-opcionais` |

**Evidência:** src/shared/lib/metrics/resolve-metric.ts:394-434 (substituicao de {filter.X}/{ambient:entity} ocorre apenas onde o token existe no template; nenhuma validacao de que os pageFilters enviados foram consumidos); useReportData.ts:307-346 (pageFilters/ambientFilters sao enviados a TODAS as metricas do batch, consumindo ou nao); prova de que ja mordeu: scripts/metrics/covenants-v2.mjs:1142-1161 (FIX Task 13 adicionando tokens {filter.banco:...} para os dropdowns passarem a filtrar) e scripts/templates/covenants-v2-entradas-saidas.template.mjs:12-16

Confirmado. E o acoplamento inverso do #26/#27: o template de pagina declara o filtro, mas cada metrica sql precisa opt-in via token. A omissao nao gera erro nem warning — a metrica retorna numeros da carteira inteira enquanto o usuario acredita estar filtrando (correcao-de-dado do ponto de vista do contexto exibido). Latente: os catalogos atuais foram corrigidos na Task 13 (evidencia acima prova que o silencio ja causou bug real). Refs de linha da doc (353-356) driftaram; o codigo real esta em 394-434.

**Proposta:** Validacao de consumo: no save da metrica (POST /api/metrics, junto de collectRecipeRefWarnings) e/ou num lint de template, avisar quando metricPageFilters declarados nao tem token correspondente no template das metricas referenciadas; opcionalmente logar server-side pageFilters nao consumidos na execucao

## `a2-metricas-11` · enabledIndicators so gateia surfacing IA; execucao via /api/metrics ignora a lista

| Campo | Valor |
|---|---|
| Origem | #33 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / latente |
| Tipo / Lente | lacuna / L2 |
| Estágio | E4 (afeta: E10, E6) |
| Componente | /api/metrics/[id]/data, /api/metrics/batch |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `enabledindicators-so-surfacing` |

**Evidência:** grep positivo: src/shared/repositories/client-semantic-context.ts:59-62,124 (unico uso runtime — intersecao no contexto semantico da IA); src/shared/schemas/client-binding.ts:77 (campo); grep negativo: zero ocorrencias de enabledIndicators em src/shared/lib/metrics/ e app/api/metrics/ — executeMetric (execute-metric.ts:118-258) gateia por ownerClientId (138-140), rota estatica (150-153), contrato coberto (210-224) e dataset (234-235), nunca pela lista

Confirmado. Alem da lista, nao ha NENHUM entitlement por produto no caminho de execucao (nada cruza product.metricRefs com a metrica pedida): qualquer metrica global cujo contrato o cliente cubra e executavel, sujeita apenas ao mapa estatico de rotas (metric-route-map.ts) e ao tenant-check. Latente: Vila Rosa usa enabledIndicators:null (= todas) — seed-vila-rosa-client.mjs:227,241 — e os dados retornados sao sempre do dataset do proprio cliente, entao nao ha vazamento cross-tenant, so ausencia de gating fino por assinatura.

**Proposta:** Aplicar enabledIndicators (quando nao-null) como checagem adicional no executeMetric (fail 403/422), ou renomear/documentar o campo como escopo exclusivamente semantico para nao vender gating que nao existe

## `a2-metricas-12` · Roteamento de dataset usa so requires[0]; sql e single-contract sem erro claro na execucao

| Campo | Valor |
|---|---|
| Origem | #34 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / latente |
| Tipo / Lente | lacuna / L4 |
| Estágio | E4 (afeta: E2, E5) |
| Componente | executeMetric (execute-metric.ts) |
| DoD / Esforço | nenhum / G |
| Causa-raiz | `dataset-por-requires0` · dep: Solucao completa bloqueada por derived-join-sem-alias |

**Evidência:** src/shared/lib/metrics/execute-metric.ts:210 (metricContractId = metric.requires[0]?.split('.')[0]) e 211-232 (todo o roteamento single-contract; resolveMetric recebe UM binding, linha 250 — templates sql resolvem todas as entidades contra o mesmo dataset); app/api/metrics/route.ts:103-109 (collectMultiContractWarnings: warning SOFT no save, nunca 422 — reconhece o limite)

Confirmado. Um sql cujo requires misture 2 contratos resolve TODAS as entidades contra o dataset do primeiro contrato: entidades do segundo contrato ou nao resolvem (MetricResolutionError 422 se migrado) ou resolvem contra tabela errada do mesmo dataset (se homonimas). O unico caminho cross-contract e derived, que carrega a limitacao do JOIN sem alias (#29). Latente: catalogo atual e todo single-contract por construcao (warning A2 nunca dispara hoje).

**Proposta:** Curto prazo: transformar o warning A2 em erro de save para recipes sql com requires multi-contract; longo prazo: roteamento por contrato tambem no caminho sql (multi-binding como o derived) — dependente de resolver derived-join-sem-alias para a alternativa derived ser viavel

## `a2-metricas-13` · DerivedFilter nao expressa snapshot-pin, igualdade extra de join nem CAST

| Campo | Valor |
|---|---|
| Origem | #35 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 |
| Componente | resolveDerivedMetric + schema DerivedRecipe |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `derived-filter-expressividade` · dep: Mesma frente de derived-join-sem-alias (#29) |

**Evidência:** src/shared/schemas/metric.ts:136-141 (DerivedFilter = attribute/op/value apenas); src/shared/lib/metrics/resolve-metric.ts:452-490 (buildDerivedFilter: literal, page-filter ou null-check — sem subquery de snapshot-pin, sem igualdade extra de join, sem CAST) e 562 (ON com uma unica igualdade da relation); scripts/metrics/covenants-v2.mjs:29-47 (motivos documentados: relation fluxo-caixa-contratos exige igualdade adicional em data_base_report; contratos x mapa_de_vendas exigiria CAST(unidade AS STRING))

Confirmado. Derivacao pela regra daria media (funcional latente), ajustada manualmente para baixa (igual doc): sao capacidades ausentes de uma feature hoje evitada em producao (todas as necessidades reais foram atendidas por kind:'sql'), sem superficie ativa afetada. Registrar junto da divida tecnica de derived (spec par. 8).

**Proposta:** Evoluir DerivedRecipe com: joins[].extraEquality (refs adicionais no ON), op de snapshot-pin declarativo (pin: max sobre um ref) e cast opcional nas pontas da relation — na mesma frente da correcao de alias do derived

## `a2-metricas-14` · sql retorna outputColumns vazio; front infere shape pelas keys — alias vira load-bearing

| Campo | Valor |
|---|---|
| Origem | #36 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 (afeta: E9, E5) |
| Componente | resolveSqlRecipe + /g (useReportData) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `sql-outputcolumns-vazio` |

**Evidência:** src/shared/lib/metrics/resolve-metric.ts:445 (return { sql, params, outputColumns: [] } para todo recipe sql); src/shared/hooks/useReportData.ts:166-178 (donut: name = primeira coluna != value/bucket na ORDEM das keys da linha), 122-143 (chart: remap por convencao bucket/value), 111 (kpi: first.value ?? primeira key) — o shape e inferido das rows, tornando o alias do template load-bearing

Confirmado. O contrato de shape entre metrica sql e bloco e implicito: donut depende da ordem/nome das colunas, waterfall/series dependem do alias literal bucket/value. Renomear um alias no template quebra a renderizacao silenciosamente (bloco vazio ou name errado), sem nenhum erro. Latente: templates atuais conformam com a convencao (aliases estaveis autorizados, covenants-v2.mjs:379-382). O batch ja transporta outputColumns (MetricExecResult, execute-metric.ts:26) — so vem vazio para sql.

**Proposta:** Preencher outputColumns para sql (parse do SELECT ou echo dos campos retornados pelo BQ job schema) e fazer o adapter preferir outputColumns quando presente, mantendo a inferencia como fallback

## `a2-metricas-15` · Fallback legado assume coluna==attributeId so com warn; erro so aparece em runtime no BQ

| Campo | Valor |
|---|---|
| Origem | #38 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | lacuna / L6 |
| Estágio | E4 (afeta: E6) |
| Componente | resolveColumn (resolve-metric.ts) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `legacy-fallback-colunas` · ADR: ADR-0015 |

**Evidência:** src/shared/lib/metrics/resolve-metric.ts:101-106 (cliente legado: console.warn + assume attributeId como coluna real) em contraste com 94-100 (cliente migrado: fail-loud); src/shared/lib/metrics/coverage.ts:26-28 (legado retorna zero gaps — pre-check tambem nao protege); src/shared/lib/semantic/flatten-binding.ts:22-34 (fallback so alcancavel quando schemaBindings E schema legado estao ambos vazios)

Confirmado nas linhas exatas citadas pela doc (sem drift). Nuance importante: desde o hardening de clientes migrados (linhas 94-100), o fallback so dispara para binding SEM schemaBindings e SEM schema legado (flattenLegacyBinding de schema nao-vazio ja conta como migrado). Nesse caso a query vai ao BQ com o nome do atributo como coluna: ou falha em runtime (500 mascarado) ou, pior, acerta uma coluna homonima com dado errado. Latente: clientes seedados atuais tem schemaBindings identity completos; clientes so-legado nem passam por aqui (loadClientBindings 422 sem productBindings).

**Proposta:** Restringir o fallback atras de flag explicita por binding (ex.: legacyIdentityColumns:true) ou remove-lo apos confirmar que nenhum cliente ativo tem binding completamente vazio; enquanto existir, promover o warn a warning estruturado observavel

## `a2-metricas-16` · 6 templates covenants JOINam literais bq-data-wh.liquid_aux fora do binding/DataSource

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | config-dados / L4 |
| Estágio | E4 (afeta: E1) |
| Componente | catalogo covenants.* (metrics de transacoes/extrato) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `aux-tables-literal-projeto` |

**Evidência:** scripts/metrics/covenants-v2.mjs:1192,1212,1237,1255,1284,1285 (LEFT JOIN `bq-data-wh.liquid_aux.ba_pluggy_categorias`/`ba_bancos` literais em 6 templates sql, gravados nos docs metrics/ de producao); decisao documentada em covenants-v2.mjs:64-66 ('fora de qualquer Data Contract, nao resolvem via binding'); contraste: todas as demais tabelas resolvem via tableRef/DataSource (resolve-metric.ts:130-144)

Item do checklist positivo (literal de projeto GCP hard-coded). E decisao consciente (Task 10), mas cria acoplamento invisivel: (a) onboarding de um cliente cujo DataSource aponte para outro projeto GCP quebra os JOINs (cross-project sem garantia de permissao do SA do cliente); (b) a dependencia de liquid_aux nao aparece em requires[] nem em contrato algum — indetectavel pelo coverage/pre-check. Latente hoje: deployment unico com tudo em bq-data-wh.

**Proposta:** Introduzir placeholder de dataset auxiliar resolvido via DataSource/config (ex.: {aux:ba_bancos}) ou registrar liquid_aux como Data Contract/binding compartilhado; enquanto nao, documentar como pre-requisito de onboarding

## `a2-metricas-17` · filter-values nao checa rota nem dataset (paridade G1); so verifyClientAccess

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / seguranca / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E4 |
| Componente | /api/metrics/filter-values |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `filter-values-sem-route-gate` · dep: Corrigir junto com filter-values-contractref-entidade (mesma rota) · ADR: ADR-0006 |

**Evidência:** grep positivo (o gate existe no caminho irmao): src/shared/lib/metrics/execute-metric.ts:150-153 (verifyRouteAccess via routeForMetric) e 234-235 (verifyDatasetAccess); grep negativo: app/api/metrics/filter-values/route.ts:38-41 faz apenas verifyClientAccess — nenhuma ocorrencia de verifyRouteAccess/verifyDatasetAccess/routeForMetric no arquivo; a rota monta SELECT DISTINCT com LIMIT 200 (route.ts:104) sobre qualquer atributo bound

Cenario de ameaca: usuario autenticado com clientAccess ao tenant mas SEM nenhuma rota concedida (conta orfa de grupos) enumera ate 200 valores distintos de qualquer entity.attribute mapeado no schemaBindings (ex.: transacoes.pagador, transacoes.descricao) chamando a rota direto — dados que na UI so apareceriam em paginas gateadas. Unico gate hoje: verifyClientAccess (tenant). Derivacao mecanica da regra (seguranca+ativo) daria alta; ajuste manual justificado para media: a exposicao e estritamente intra-tenant (dataset vem dos bindings do proprio cliente — cross-tenant impossivel por construcao), mesma classe 'defense-in-depth' que o spec par. 8 aloca em WS-5. Nota: a correcao deve vir junto do fix de filter-values-contractref-entidade (mesmo arquivo).

**Proposta:** Adicionar verifyDatasetAccess(email, dataset.datasetId, clientId) (paridade defense-in-depth) e um gate de rota (a rota so serve dropdowns do /g hoje — checar '/g' ou derivar do template solicitante)

---

# a3-templates — E3 Products + E5 Templates + E7 Reports & Groups

> **Varredura (resumo do auditor):** Escopo varrido além das 11 hipóteses (#39-#49): (1) as 4 rotas API do estágio lidas integralmente — app/api/products/route.ts, app/api/dashboard-templates/route.ts, app/api/reports/route.ts, app/api/report-groups/route.ts — com o checklist positivo (fail-open em permissão, zod ausente, tenant, NODE_ENV, admin-gate), cruzadas com src/shared/lib/api-auth.ts e confirmação de ausência de middleware.ts; (2) os 23 scripts/templates/*.template.mjs com validação estática programática (import de dados puros, sem cliente cloud): soma de colSpan por linha = 6 em 100% das linhas, nenhuma linha com >3 blocos, nenhum blockId órfão (isso rebaixou o alcance do bug do flatten para latente e refutou a parte 'só canvas' da hipótese #48); (3) seeds em leitura estática: seed-play-templates.ts, seed-vila-rosa-client.mjs, seed-vila-rosa-reports.mjs, trecho renameLegacyPlay de seed-liquid-play-contracts.mjs; (4) galeria completa (TemplateGallery, useTemplates, useProducts, useActiveProduct, ponto de montagem no AppBar) incluindo o gating por produto; (5) paridade schema de bloco ↔ renderer: CanvasBlockRenderer cobre os 8 tipos declarados em agents/types.ts; campos de GaugeBlock, TableBlock (status-badge/date/footerAggregations), SingleKpiBlock (alertThreshold — escala consistente pós-×100 via parseRawValue), DonutBlock (format/showLegendCards/colors) todos renderizam — o único gap de paridade encontrado foi o branch kpi de useReportData não desembrulhar objetos {value} de DATE (achado novo); (6) instanciação template→report (handleImport, createReport, /api/reports, drill-through.ts) e ciclo de vida (duplicate/move/delete/cascade de grupos). Razão novo:hipótese = 10:11. NÃO coberto por tempo/escopo: execução da suíte vitest (tudo por leitura estática — nenhum teste rodado); as recipes SQL das 64 métricas covenants-v2 além de obra_data_medicao (correção numérica L6 profunda é do E4); Admin UI de templates (TemplatesTab/useAdminTemplates/TemplateForm) lida só superficialmente; TextBlock/KpiBlock ('kpis') e waterfall.ts não lidos linha a linha; hooks useGroups/useReports apenas nas assinaturas; export-pdf, PageFilterBar e tema (E9) fora do escopo deste agente.

## `a3-templates-01` · 10 templates Play declaram productRefs:['play'] órfão — invisíveis p/ clientes com bindings

| Campo | Valor |
|---|---|
| Origem | #39 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | config-dados / L4 |
| Estágio | E5 (afeta: E3, E9) |
| Componente | TemplateGallery (modal Importar template) / dashboardTemplates |
| DoD / Esforço | DoD-1 / P |
| Causa-raiz | `templates-productrefs-play-orfao` |

**Evidência:** scripts/templates/visao-geral.template.mjs:17 (+contratos:109, inadimplencia:179, detalhamento:26, pagamentos:36, fluxo-caixa:23, pricing:53, simulacao-ltv:39, repasse:41, pdd:33 — todos productRefs:['play']); scripts/seed-liquid-play-contracts.mjs:348-373 (products/play → play-legacy status archived + DELETE products/play); src/shared/hooks/useProducts.ts:57 (store filtra status==='active' — play-legacy nunca entra); src/widgets/nav-sidebar/ui/TemplateGallery.tsx:120-124 (template escondido se productRefs não intersecta produtos do cliente); scripts/seed-vila-rosa-client.mjs:213-243 (vila-rosa binda liquid-play/liquid-play-plus); grep 'alias play' em src = 0

Confirmado ponta-a-ponta: o produto 'play' foi renomeado para 'play-legacy' (archived) e o doc products/play deletado pelo seed; useProducts.ts:57 filtra archived do store, então nem cliente bindado a play-legacy enxerga esses templates. Vila Rosa (liquid-play + liquid-play-plus) e Galli não veem os 10 templates Play na galeria. Só cliente legacy SEM productBindings (clientProductIds.size===0 → sem filtro, TemplateGallery.tsx:121) vê tudo. Não existe alias play→liquid-play em lugar nenhum do src. Severidade alta pela regra §5: funcional+ativo bloqueando DoD-1 (item-âncora do WS-3 no §8 do spec).

**Proposta:** Reconciliar productRefs dos 10 .mjs para o slug de produto vivo (liquid-play) e re-seedar; alternativa: mapa de alias play→liquid-play no gating da galeria. Verificar antes se os metricRefs desses templates resolvem no contrato liquid-play.

## `a3-templates-02` · Templates covenants v1 não existem no conjunto canônico; refs ['covenants'] só em fixtures

| Campo | Valor |
|---|---|
| Origem | #40 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / ativo |
| Tipo / Lente | codigo-morto / L1 |
| Estágio | E5 |
| Componente | dashboardTemplates / fixtures de teste |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `covenants-v1-refs-so-em-fixtures` |

**Evidência:** src/shared/config/dashboard-templates.ts:3-14 (comentário confirma remoção do array DASHBOARD_TEMPLATES e dos seeds antigos); scripts/seed-play-templates.ts:50-55 (conjunto canônico de 23 templates: 10 'play' + 13 'liquid-play-plus', nenhum 'covenants'); grep productRefs:['covenants'] fora de docs/plans = apenas src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx:95,116 e src/shared/schemas/__tests__/dashboard-template.test.ts:53

Observação confirmada como retrato fiel do código: o array hard-coded foi removido (Tier 2c), o seed canônico não emite nenhum template com productRefs ['covenants'], e as únicas ocorrências vivas de 'covenants' como productRef são fixtures de teste. O produto products/covenants ainda existe no Firestore (legado de 8 clientes, cf. scripts/seed-vila-rosa-client.mjs:19-25) mas sem template canônico apontando para ele.

**Proposta:** Nada a corrigir no runtime; opcionalmente atualizar fixtures de teste para slugs vivos (liquid-play-plus) para evitar leitura enganosa, e registrar na doc que covenants v1 saiu do catálogo.

## `a3-templates-03` · Gauge nunca multiplica percentual por 100; KPI/table multiplicam — mesma métrica, escalas diferentes

| Campo | Valor |
|---|---|
| Origem | #41 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | inconsistencia / L6 |
| Estágio | E5 (afeta: E9) |
| Componente | /g (GaugeBlock + useReportData pipeline) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `gauge-nao-escala-percentual` |

**Evidência:** src/shared/hooks/useReportData.ts:40-43 (KPI format:'percent' → formatPercent(value*100)) e src/pages/explore/ui/blocks/TableBlock.tsx:42-43 (idem ×100) LADO A LADO com useReportData.ts:182-189 (branch gauge atribui num cru, sem ×100) e GaugeBlock.tsx:25-33 (formatGaugeValue passa v cru a formatPercent) + GaugeBlock.tsx:7-23,37-42 (classify compara block.value cru contra threshold); src/shared/lib/format.ts:23-29 (formatPercent espera escala 0-100); contorno documentado em scripts/templates/covenants-v2-visao-executiva.template.mjs:9-18 e covenants-v2-evolucao-obra.template.mjs:11-15

Confirmado: métrica razão 0–1 ligada a gauge com format:'percent' exibiria '0,83%' e classificaria sempre vermelho contra threshold 0–100. Hoje contornado nos templates (certidões virou KPI; índices 'x' e obra 0–100 cru usam gauge sem conversão) — por isso latente. O schema (agents/types.ts:295-311) não impede o erro: qualquer template/canvas novo pode recriar o bug. correção-de-dado latente → média (regra §5), igual à Sev da doc.

**Proposta:** Unificar a fronteira de apresentação: branch gauge de useReportData aplica ×100 quando format==='percent' (valor E thresholds na mesma escala), ou schema do GaugeBlock ganha campo explícito de escala; migrar os templates que contornaram junto (mudança coordenada).

## `a3-templates-04` · Thresholds de covenant em produção são placeholders 'A CONFIRMAR' — semáforo pode não refletir contrato

| Campo | Valor |
|---|---|
| Origem | #42 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / correcao-de-dado / ativo |
| Tipo / Lente | config-dados / L6 |
| Estágio | E5 |
| Componente | /g/{covenants}/r/visao-executiva, /evolucao-obra, /inadimplencia (gauges e alertThresholds) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `thresholds-covenant-placeholder` |

**Evidência:** scripts/templates/covenants-v2-visao-executiva.template.mjs:97-106 (threshold 1.2/warn 1.5 nos dois gauges + comentário 'THRESHOLD A CONFIRMAR' em :100 e :105); covenants-v2-evolucao-obra.template.mjs:62-66 (threshold -5/-2 'ilustrativo', 'THRESHOLD A CONFIRMAR' em :65 e no JSDoc :17); covenants-v2-inadimplencia.template.mjs:48-55 (alertThreshold 5 e 3 com 'THRESHOLD A CONFIRMAR' em :50 e :54)

Confirmado nos três templates: os valores que pintam verde/âmbar/vermelho (indice_recebivel 1.2/1.5, desvio de obra -5/-2, inadimplência 5%/over90 3%) estão marcados como não confirmados no próprio código. Como os reports do vila-rosa foram instanciados por deep-copy (seeds já rodados em produção), os placeholders estão VIVOS no dashboard do cliente. Regra §5: config cuja leitura errada afeta compliance (thresholds de covenant) → correção-de-dado, ativo → alta. É item-âncora do WS-0 (gate de release), não de DoD-1/2.

**Proposta:** Obter os limites contratuais reais (contrato do Inter) e atualizar os templates + reports já instanciados do vila-rosa (re-seed --force ou PATCH); até lá, considerar remover a cor condicional ou rotular como indicativo. Gate de release WS-0 do spec.

## `a3-templates-05` · RATING_STATUS_MAP A-H é convenção inventada — semáforo bom/ruim sem semântica de domínio

| Campo | Valor |
|---|---|
| Origem | #43 · Δ sev: doc: média -> codigo: alta |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / correcao-de-dado / ativo |
| Tipo / Lente | config-dados / L6 |
| Estágio | E5 |
| Componente | /g/{covenants}/r/mapa-vendas (coluna Rating Liquid status-badge) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `rating-status-map-ilustrativo` |

**Evidência:** scripts/templates/covenants-v2-mapa-vendas.template.mjs:24-28 (RATING_STATUS_MAP A/B=success, C/D/E=warning, F/G/H=danger) + :35 (aplicado como statusMap da coluna rating_liquid); JSDoc :6-9 admite 'statusMap A–H ilustrativo (não há semáforo de rating no domínio... Looker original só usa paleta categórica)'; renderização em src/pages/explore/ui/blocks/TableBlock.tsx:18-30,53-57

Confirmado: o mapa está vivo no template e nos reports instanciados. Derivei alta pela regra literal do §5 ('config cuja leitura errada afeta compliance (thresholds de covenant, mapas de status) → tratar como correção-de-dado' + ativo → alta) — o spec §8 também lista este item no WS-0 (gate de release). A doc atribuiu média; registro o delta e deixo o ajuste para a consolidação (argumento para média: a direção A-melhor/H-pior é convenção usual de rating; o risco é induzir leitura de compliance não pactuada).

**Proposta:** Validar com o cliente/negócio se rating deve ter semântica de status; se não, trocar status-badge por badge categórico neutro (paleta como no Looker) ou remover o statusMap. Item do gate WS-0.

## `a3-templates-06` · Breakdown da galeria não conta donut/gauge/text — badges somam menos que o total de blocos

| Campo | Valor |
|---|---|
| Origem | #44 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / ativo |
| Tipo / Lente | cosmetico / L1 |
| Estágio | E5 |
| Componente | TemplateGallery (badges de resumo do painel de detalhe) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `galeria-breakdown-ignora-donut-gauge` |

**Evidência:** src/widgets/nav-sidebar/ui/TemplateGallery.tsx:54-69 (summarizeBlocks só classifica kpi/kpis, chart, table — donut, gauge e text caem no vazio) vs :153 (totalBlocks = todas as chaves do blockMap) e :330-333 (badges exibem total + só 3 categorias); ex. alcançável: covenants-v2-visao-executiva tem 2 gauges + 1 donut + 1 text (blockMap :96-139) — badges somam 13 de '17 blocos'

**Proposta:** Estender summarizeBlocks com donut/gauge (e opcionalmente text) e exibir badges correspondentes, ou rotular o restante como 'outros'.

## `a3-templates-07` · CHART_TYPE_LABEL sem 'waterfall' — painel de detalhe mostra rótulo cru em inglês

| Campo | Valor |
|---|---|
| Origem | #45 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / ativo |
| Tipo / Lente | cosmetico / L1 |
| Estágio | E5 |
| Componente | TemplateGallery (painel de detalhe, lista de gráficos) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `galeria-label-waterfall-ausente` |

**Evidência:** src/widgets/nav-sidebar/ui/TemplateGallery.tsx:71-77 (CHART_TYPE_LABEL mapeia bar/line/area/composed/stacked-bar; sem waterfall) + :367 (fallback exibe o valor cru 'waterfall'); instância alcançável: scripts/templates/covenants-v2-visao-executiva.template.mjs:137 (chart-extrato-resumido, chartType 'waterfall')

**Proposta:** Adicionar waterfall: 'Cascata' (e futuros chartTypes) ao mapa de rótulos.

## `a3-templates-08` · Zero-line/reference-lines com rgba branco hardcoded — quase invisíveis no tema claro

| Campo | Valor |
|---|---|
| Origem | #46 · Δ sev: doc: média -> codigo: baixa |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / ativo |
| Tipo / Lente | cosmetico / L1 |
| Estágio | E5 (afeta: E9) |
| Componente | /g (ChartBlock — reference lines e zero-line) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `chartblock-cores-hardcoded-brancas` |

**Evidência:** src/pages/explore/ui/blocks/ChartBlock.tsx:95 (stroke default 'rgba(255,255,255,0.25)'), :97 (label fill 'rgba(255,255,255,0.5)'), :146-147 (zero-line 'rgba(255,255,255,0.15)' nas duas orientações); alcançável hoje: covenants-v2-visao-executiva chart-entradas-saidas (bar credit/debit com negativos → hasNegativeValues → zeroLine); a sub-alegação da doc sobre a base do waterfall driftou: ChartBlock.tsx:292 usa fill='transparent'; grep referenceLines em scripts/templates = 0

Confirmado parcialmente: as linhas de referência e a zero-line seguem brancas hardcoded (invisíveis no tema claro, que é suportado via next-themes); porém a base do waterfall já é transparent (doc-drift na sub-alegação). Nenhum template atual declara referenceLines (grep=0) — o caso alcançável hoje é só a zero-line do gráfico Entradas & Saídas. Por ser guia visual sem dado de negócio, derivei cosmético→baixa (ajuste justificado vs média da doc).

**Proposta:** Trocar os rgba(255,255,255,...) por tokens semânticos (var(--color-border)/--color-muted-foreground) conforme a diretriz do CLAUDE.md, cobrindo light e dark.

## `a3-templates-09` · Mudança em template não propaga a reports instanciados — só deep-copy pontual, sem sync

| Campo | Valor |
|---|---|
| Origem | #47 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L1 |
| Estágio | E5 (afeta: E7) |
| Componente | TemplateGallery.handleImport / /api/reports / seeds de reports |
| DoD / Esforço | nenhum / G |
| Causa-raiz | `template-report-sem-propagacao` |

**Evidência:** grep positivo (instanciação existe): src/widgets/nav-sidebar/ui/TemplateGallery.tsx:157-176 (handleImport deep-copy JSON.parse(JSON.stringify) de blockMap/layout/queries/filters; templateId guardado só como lineage) e scripts/seed-vila-rosa-reports.mjs:101-118 (mesma deep-copy) + :191-194 (re-seed sem --force PULA report divergente); grep negativo (sync ausente): busca por sync/propagate/resync/re-import em src retorna só import/duplicate — nenhum mecanismo template→reports

Confirmado. Consequência prática imediata: os fixes dos achados #42/#43 (thresholds/statusMap) não chegarão aos 13 reports do vila-rosa apenas re-seedando templates — é preciso re-seed dos reports com --force ou PATCH manual. templateId é usado só para drill-through (ReportPage.tsx:259-262), não para versão.

**Proposta:** Decidir o modelo: (a) comando admin 'sincronizar template→reports' (diff + apply respeitando edições locais) ou (b) documentar deep-copy como contrato e padronizar re-seed --force como runbook de atualização. Correções de template (ex.: thresholds do WS-0) hoje exigem tocar cada report.

## `a3-templates-10` · flattenKpiBlocks regrupa linhas em máx 3 ignorando colSpan; edição de report persiste o layout mutilado

| Campo | Valor |
|---|---|
| Origem | #48 · Δ sev: doc: baixa -> codigo: média |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / latente |
| Tipo / Lente | bug / L1 |
| Estágio | E5 (afeta: E9) |
| Componente | /g/{groupId}/r/{reportId} (modo edição) + canvas/explore |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `flatten-kpi-regrupa-ignora-colspan` |

**Evidência:** Trace do caminho de edição de report (NÃO só canvas, como a doc supunha): src/pages/report/ui/ReportPage.tsx:135-143 (handleEdit monta CanvasPage e chama loadPages) → src/shared/stores/canvas-store.ts:273-276 (loadPages aplica migratePage) → src/shared/config/agents/types.ts:506 (migratePage sempre chama flattenKpiBlocks) → types.ts:471-476 (regrupa TODOS os blockIds em linhas de máx 3, ids novos, ignora colSpan) → ReportPage.tsx:203-211 (handleSave PERSISTE activePage.layout). Visualização pura não passa por migratePage (ReportPage.tsx:356-369 renderiza report.layout direto). Input disparador: report com linha de >3 blocos → editar → salvar. Mitigação verificada: validação estática dos 23 templates canônicos — nenhuma linha com >3 blocos e toda soma de colSpan = 6

A hipótese pedia confirmação de que o risco era só canvas/explore — REFUTEI essa parte: o modo edição de QUALQUER report passa por loadPages→migratePage→flattenKpiBlocks, e o Salvar persiste o layout regrupado. Hoje é latente porque nenhum template canônico tem linha com >3 blocos (verificado nos 23), então o regrupamento é identidade; qualquer report futuro com linha de 4+ blocos (canvas/IA/manual) será permanentemente reagrupado ao editar+salvar. Subo de baixa para média (funcional latente, footgun real no caminho de persistência).

**Proposta:** flattenKpiBlocks deve preservar a estrutura de linhas quando a página já está no formato novo (só explodir blocos 'kpis'), ou agrupar por soma de colSpan≤6 em vez de contagem de 3; aplicar flatten apenas na migração de páginas legadas.

## `a3-templates-11` · Campo queries é persistido e copiado mas ignorado na renderização — dado morto

| Campo | Valor |
|---|---|
| Origem | #49 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / ativo |
| Tipo / Lente | codigo-morto / L1 |
| Estágio | E5 (afeta: E7) |
| Componente | /api/reports, /api/dashboard-templates (campo queries) + useReportData |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `report-queries-campo-morto` |

**Evidência:** src/shared/hooks/useReportData.ts:226-228,240 (parâmetro _queries aceito 'para retrocompat' e descartado com void _queries); persistência viva do campo morto: app/api/reports/route.ts:201-203 (POST grava queries), TemplateGallery.tsx:160,166 (import copia queries), scripts/seed-vila-rosa-reports.mjs:113-115; grep de consumidores de report.queries fora da persistência/tipos = 0 (toda busca de dados é metricId → /api/metrics/batch, useReportData.ts:59-101)

**Proposta:** Deprecar formalmente: parar de copiar/persistir queries em novos reports e remover dos shapes públicos (TemplateRecord/Report) em minor futura; manter leitura tolerante para docs antigos.

## `a3-templates-12` · Qualquer usuário autenticado (não-admin) pode criar/editar/APAGAR templates globais

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / seguranca / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E5 |
| Componente | /api/dashboard-templates (POST/PATCH/DELETE) |
| DoD / Esforço | DoD-1 / P |
| Causa-raiz | `templates-escrita-sem-admin` |

**Evidência:** Cenário de ameaça + fail-open + prova de gate único: app/api/dashboard-templates/route.ts:49-51 (POST), :129-131 (PATCH), :148-155 (DELETE) exigem apenas verifyAuthToken; src/shared/lib/api-auth.ts:45-70 (verifyAuthToken devolve email de QUALQUER usuário Firebase válido, sem checar admin/claims); não há middleware.ts no repo (glob=0) nem isAdminEmail no arquivo (grep de isAdminEmail em app/api não inclui dashboard-templates); contraste lado a lado: app/api/products/route.ts:99,170 (escritas exigem isAdminEmail); teste espelha o gap (route.test.ts só cobre 401, nunca 403)

dashboardTemplates é recurso GLOBAL cross-tenant (fonte dos imports de todos os clientes). Um usuário externo não-admin com token válido (ex.: usuário vila-rosa do DoD-1) pode DELETE /api/dashboard-templates?id=covenants-v2-visao-executiva e destruir o catálogo, ou editar um template que outro tenant importará (injeção de conteúdo cross-tenant). Único gate é autenticação — confirmado como único por leitura do arquivo inteiro + ausência de middleware. Mapeio a DoD-1 porque liberar usuário externo sem esse fix expõe superfície de escrita global (mesmo espírito do item 8 — bypasses/escopo contidos).

**Proposta:** Adicionar gate de admin (isAdminEmail, paridade com /api/products) às escritas de /api/dashboard-templates; adicionar caso 403 ao teste da rota.

## `a3-templates-13` · Escritas de reports/groups sem zod (blockMap/layout crus) e move sem checar grupo destino

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L1 |
| Estágio | E7 (afeta: E5) |
| Componente | /api/reports (POST/PATCH), /api/report-groups (POST/PATCH), /api/dashboard-templates (PATCH) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `reports-escrita-sem-validacao` |

**Evidência:** grep positivo (validação existe no vizinho): app/api/dashboard-templates/route.ts:82-93 (POST valida TemplateId + DashboardTemplateDoc zod); grep negativo: app/api/reports/route.ts não importa zod — body cast direto (route.ts:90-105) e blockMap/layout/filters persistidos crus (:190-216, :255-260); PATCH de templates também sem zod (dashboard-templates/route.ts:134-140, update com body[key] cru); move de report não verifica existência do grupo destino: reports/route.ts:149-181 (targetCol.add + delete da origem SEM get() de clients/{id}/groups/{toGroupId}) — toGroupId com typo move o report para grupo-fantasma invisível na navegação (report-groups GET lista só docs de groups, route.ts:24-38) e apaga o original

layout não-array quebra a renderização ((report.layout ?? []).map em ReportPage.tsx:356 lança se layout for objeto), e o move para grupo inexistente é perda de dado do ponto de vista do usuário (report órfão inacessível + original deletado). UI atual restringe os inputs (menus só oferecem grupos existentes), então o vetor é API direta — por isso média e não alta.

**Proposta:** Introduzir schema zod mínimo para Report (name, blockMap record, layout CanvasRow[], filters) aplicado em POST/PATCH; validar existência de groupId/toGroupId antes de criar/mover (404/422); espelhar validação no PATCH de dashboard-templates.

## `a3-templates-14` · KPI ligado a métrica DATE exibe '[object Object]' — branch kpi não desembrulha {value} do BigQuery

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | bug / L6 |
| Estágio | E5 (afeta: E9) |
| Componente | /g/{covenants}/r/evolucao-obra (KPI 'Data da Medição') + useReportData |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `kpi-date-object-sem-unwrap` |

**Evidência:** Trace: scripts/metrics/covenants-v2.mjs:787-800 (covenants.obra_data_medicao faz SELECT {evolucao_obra.data_medicao} AS value — DATE cru, sem CAST/FORMAT_DATE) → src/shared/lib/metrics/execute-metric.ts:250-253 (rows do BigQuery devolvidas cruas; DATE serializa como objeto {value:'YYYY-MM-DD'}) → src/shared/hooks/useReportData.ts:107-118 (branch kpi NÃO desembrulha objetos {value}: Number(obj)=NaN → kpiBlock.value=String(obj)='[object Object]') — em contraste com os branches chart (:132-133), table (:150-151) e donut (:171-172), que desembrulham exatamente esse shape; consumidor: scripts/templates/covenants-v2-evolucao-obra.template.mjs:60 (kpi-obra-data-medicao, sem format). Input disparador: abrir o report Evolução de Obra do vila-rosa

A existência do unwrap nos outros três branches (comentários 'Convenções do resolver') prova que o shape {value} de DATE/DATETIME chega de fato ao cliente. O único KPI canônico afetado hoje é covenants.obra_data_medicao (demais KPIs são numéricos), mas qualquer KPI futuro de data/timestamp reproduz.

**Proposta:** No branch kpi de applyMetricRowsToBlock, desembrulhar objetos {value} antes de Number()/String() (mesma convenção dos branches chart/table/donut); alternativa: FORMAT_DATE na recipe.

## `a3-templates-15` · Update de produto via POST apaga createdAt (spread condicional + merge:false)

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / ativo |
| Tipo / Lente | bug / L1 |
| Estágio | E3 (afeta: E6) |
| Componente | /api/products (POST upsert) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `products-createdat-perdido-merge-false` |

**Evidência:** app/api/products/route.ts:141-152: quando existing.exists o payload NÃO inclui createdAt (spread condicional ...(existing.exists ? {} : {createdAt: now})) e o set usa {merge:false} — replace total do doc → todo UPDATE de produto pela Admin UI apaga o campo createdAt; contraste lado a lado: app/api/dashboard-templates/route.ts:109-118 usa o mesmo spread condicional mas com {merge:true} (createdAt preservado); nenhum teste cobre createdAt (grep createdAt em products/__tests__ = 0)

**Proposta:** Ao atualizar doc existente, carregar createdAt do doc atual para o payload (createdAt: existing.get('createdAt') ?? now) ou trocar para merge:true; adicionar assert de round-trip no teste. Mesmo padrão do item WS-2 de clients (createdAt zerado) — corrigir em conjunto.

## `a3-templates-16` · useActiveProductIndicators @deprecated sem nenhum consumidor — código morto

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / ativo |
| Tipo / Lente | codigo-morto / L1 |
| Estágio | E3 |
| Componente | src/shared/hooks/useActiveProduct.ts |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `useactiveproductindicators-morto` · ADR: ADR-0015 |

**Evidência:** src/shared/hooks/useActiveProduct.ts:36-40 (função marcada @deprecated — 'usar useActiveProductMetrics() (ADR-0015)'); grep useActiveProductIndicators em src retorna apenas a própria definição — zero consumidores (nem testes)

**Proposta:** Remover a função (ADR-0015 já supre via useActiveProductMetrics, que mantém o fallback legado internamente).

## `a3-templates-17` · Projeto GCP e database Firestore hard-coded nos seeds de templates/cliente/reports

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / config / ativo |
| Tipo / Lente | config-dados / L4 |
| Estágio | OPS (afeta: E5, E6, E7) |
| Componente | scripts/seed-play-templates.ts, scripts/seed-vila-rosa-client.mjs, scripts/seed-vila-rosa-reports.mjs |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `seeds-gcp-project-hardcoded` |

**Evidência:** scripts/seed-play-templates.ts:44-45 (PROJECT_ID='liquid-micro-apps', DB_ID='liquid-play-dataviz' — comentário :42-43 declara escolha deliberada 'Evita depender de env de projeto'); scripts/seed-vila-rosa-client.mjs:61-62 e scripts/seed-vila-rosa-reports.mjs:37-38 (mesmos literais)

Item do checklist positivo (§6.3: 'todo literal de projeto GCP hard-coded'). Ajuste manual para baixa: são scripts operacionais com escolha documentada, sem branch de runtime afetado — o runtime resolve projeto via runtime-config/DataSource.

**Proposta:** Extrair PROJECT_ID/DB_ID para constante compartilhada de scripts (ou env com default documentado) — reduz risco de drift quando surgir ambiente de staging; manter default de produção explícito já que é deliberado.

## `a3-templates-18` · Templates status 'draft' (ex.: cópias do admin) aparecem na galeria de importação p/ usuários

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / ativo |
| Tipo / Lente | lacuna / L1 |
| Estágio | E5 |
| Componente | TemplateGallery / useTemplates |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `galeria-exibe-drafts` |

**Evidência:** src/shared/hooks/useTemplates.ts:12 (filtra apenas status!=='archived' — 'draft' passa); produção de drafts: app/api/dashboard-templates/route.ts:71-77 (action duplicate grava status:'draft'); a galeria (TemplateGallery.tsx:116-135) não filtra por status; schema declara três estados active/draft/archived (src/shared/schemas/dashboard-template.ts:19)

Ajuste manual para baixa: impacto é curatorial (rascunho exposto), sem quebra de fluxo nem dado errado.

**Proposta:** Filtrar status==='active' na galeria (mantendo draft visível só na Admin UI), ou documentar que draft é público — hoje o estado draft não tem efeito nenhum fora do admin.

## `a3-templates-19` · Cliente bindado só a produtos archived vê TODOS os templates (sentinel vazio = sem filtro)

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / latente |
| Tipo / Lente | bug / L2 |
| Estágio | E5 (afeta: E3) |
| Componente | TemplateGallery (escopo por produto contratado) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `galeria-gating-failopen-archived` · dep: relacionado a templates-productrefs-play-orfao (mesmo gating) |

**Evidência:** Trace: src/shared/hooks/useProducts.ts:57 (store só recebe produtos status==='active') → src/shared/hooks/useActiveProduct.ts:99-106 (useAvailableProducts = products ∩ bindings; cliente bindado só a produto archived → retorna []) → src/widgets/nav-sidebar/ui/TemplateGallery.tsx:91-94,120-124 (clientProductIds.size===0 é tratado como 'sem escopo, mostra tudo' — sentinel de load reutilizado como fail-open). Input disparador: cliente cujos productBindings apontem apenas para produtos archived (ex.: só play-legacy)

Latente: os clientes conhecidos têm ao menos um produto ativo no binding. Não é vazamento de dados (templates são globais e legíveis por qualquer autenticado via GET), é colapso do escopo de UX — o mesmo arquivo do achado #39.

**Proposta:** Distinguir 'carregando' de 'nenhum produto ativo assinado': em loading não filtrar; com bindings resolvidos e interseção vazia, mostrar galeria vazia (fail-closed de escopo).

## `a3-templates-20` · Duplicar report copia templateId — drill-through {report:...} pode resolver para a cópia

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / latente |
| Tipo / Lente | bug / L1 |
| Estágio | E7 (afeta: E9) |
| Componente | /api/reports (action duplicate) + drill-through |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `duplicate-report-templateid-ambiguo` |

**Evidência:** app/api/reports/route.ts:141 (duplicate copia data.templateId para a cópia) → dois reports do MESMO grupo compartilham templateId → src/pages/report/ui/ReportPage.tsx:259-262 (resolveReportId = groupReports.find(r => r.templateId === templateId) — primeiro match por ordem) + src/pages/report/ui/drill-through.ts:84-91 (token {report:<templateId>} resolve para esse primeiro match). Input disparador: duplicar (menu 'Duplicar página', AppBar.tsx:262-267) um report alvo de drill-through (ex.: extrato-detalhado) e navegar pelo link de outro report

**Proposta:** Não copiar templateId na duplicação (lineage é do import, não da cópia) ou resolver drill-through preferindo o report de menor order/mais antigo com desempate documentado.

## `a3-templates-21` · Qualquer usuário com clientAccess pode criar/editar/apagar reports e grupos do seu tenant

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | plausivel (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / seguranca / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E7 (afeta: E8, E9) |
| Componente | /api/reports, /api/report-groups (todas as escritas) + AppBar |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `reports-escrita-sem-papel-editor` |

**Evidência:** Server: app/api/reports/route.ts:83-114 (POST), :225-253 (PATCH), :271-295 (DELETE) e app/api/report-groups/route.ts:45-77,80-113,115-149 gateiam escrita apenas por verifyAuthToken + verifyClientAccess (api-auth.ts:182-207 — só checa clientAccess, sem papel/rota); nenhum uso de verifyRouteAccess ou isAdminEmail nessas rotas. Client: src/widgets/app-bar/ui/AppBar.tsx:250-296 expõe 'Nova página', 'Renomear', 'Duplicar', 'Excluir página', 'Editar' e 'Importar template' sem nenhuma condição isAdmin (grep isAdmin no arquivo = 0)

O comportamento do código está confirmado por leitura (isolamento de tenant OK — verifyClientAccess impede IDOR cross-tenant), mas classifico o DEFEITO como plausível porque a intenção de produto não está estabelecida: a UI expõe as ações a todos deliberadamente, o que sugere self-service BI. O risco: o usuário viewer do DoD-1 (vila-rosa) pode apagar/mutilar os 13 dashboards do próprio cliente (afetando os demais usuários do tenant) — combinado com o achado flatten-kpi (#48), um simples editar+salvar persiste layout regenerado. Mantive média (não alta) pela incerteza de intenção; resolver no pass adversarial/consolidação.

**Proposta:** Decisão de produto: se o usuário externo do DoD-1 é somente-leitura, introduzir papel editor (por grupo RBAC ou flag em clientAccess) checado nas escritas de reports/groups e ocultar as ações na UI; se self-service é intencional, registrar como decisão e cobrir com testes.

---

# a4-cliente-permissoes — E6 Cliente & bindings + E8 Usuários & permissões

> **Varredura (resumo do auditor):** Varri E6 (app/api/clients, ClientForm, ProductBindingsEditor, make-dataset-binding, client.ts/client-binding.ts, client-semantic-context, seed-vila-rosa e seed-firestore) e E8 (app/api/users, app/api/groups, app/api/report-groups, authorize.ts, metric-route-map.ts, api-auth.ts, runtime-config.ts, useUserPermissions, ProtectedRoute, AuthProvider, useAuth, require-admin.ts, grant-claims.ts, firestore.rules) + mapa real de rotas (app/(dashboard)/**/page.tsx) vs ALL_ROUTES. As 10 hipoteses (#1-#10) foram todas confirmadas do codigo; #3 subiu de media->alta (bloqueia DoD-1). 4 achados NOVOS: firestore.rules com write cross-tenant aberto em clients/{id}/groups+reports (alta), provisionamento de credencial/claim ausente (alta, DoD-1 #6), seed --force descarta createdAt (media), e write routes sem zod/routeOverrides nao validado (baixa). Confirmei tambem que /api/bigquery nao existe mais (glob=0) e createUser=0 no app. NAO cobri em profundidade: /api/benchmark (transversal/OPS, fora do meu escopo E6/E8), as paginas /covenants/configuracao/* (fora de ALL_ROUTES, aparentemente admin-config - nao validei gating), NavSidebar (origem dos itens de nav de report), e o print-token (li export-pdf/route.ts e verify - token e one-time/60s/consumido, aparenta escopado; nao aprofundei se _pt concede mais que render). Nao executei testes (leitura estatica apenas, conforme salvaguardas).

## `a4-cliente-permissoes-01` · Rotas /g e /explore nao sao concediveis pela Admin UI (ausentes de ALL_ROUTES/RouteCheckboxGrid)

| Campo | Valor |
|---|---|
| Origem | #2 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei toda a evidencia no codigo atual. (1) ALL_ROUTES (src/features/admin/model/types.ts:55-70) nao contem '/g'; '/explore' esta na linha 66 com group 'IA'. (2) RouteCheckboxGrid.tsx:11 define ROUTE_GROUPS=['Carteira','Risco','Operacional','Anexos'] e as linhas 14-16 filtram ALL_ROUTES por esses grupos — 'IA' nunca renderiza, logo nem /explore nem /g aparecem como checkbox. (3) RouteCheckboxGrid e a UNICA superficie de concessao de rotas na Admin UI: UserForm.tsx:358 (routeOverrides/customRoutes) e GroupForm.tsx:115 (group.routes), sem input free-text. (4) Nao ha mitigacao em outra camada — ao contrario, o enforcement e deny-by-default nos dois lados: cliente (useUserPermissions.tsx:164-171) e servidor (authorize.ts:35-49, chamado por api-auth.ts:251-253 via execute-metric.ts:150-154 com routeForMetric→'/g' para as 64 covenants.* de metric-route-map.ts:83-154). Rota desconhecida NAO e default-allow. (5) Cenario alcancavel por ator real: admin @askliquid.com (bypass confirmado em useUserPermissions.tsx:45 e authorize.ts:43, isAdminEmail em runtime-config.ts:32-35) nao tem como conceder /g a um usuario Vila Rosa; o nao-admin toma redirect no ProtectedRoute (DashboardLayout.tsx:70/80) e 403 em /api/metrics/*. Nuance corroborante (nao refuta; ja e DoD-1 item 3): mesmo com '/g' concedido via Firestore direto, o guard client-side compara o pathname completo /g/{groupId}/r/{reportId} por igualdade exata, entao a proposta precisa incluir o alinhamento de route-match (alsoAffects E9 correto). [src/features/admin/ui/RouteCheckboxGrid.tsx:11 e src/features/admin/model/types.ts:55-70 (lidos por mim); regra de severidade em docs/superpowers/specs/2026-07-21-revisao-remediacao-design.md:131 (funcional+ativo+bloqueia DoD-1 → alta; o proprio spec cita este achado como o exemplo P0 da regra)] |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E8 (afeta: E6, E9) |
| Componente | /g, /explore (RouteCheckboxGrid / ALL_ROUTES) |
| DoD / Esforço | DoD-1 / P |
| Causa-raiz | `g-explore-nao-concediveis-admin-ui` · ADR: ADR-0006 |

**Evidência:** src/features/admin/model/types.ts:55-70 (ALL_ROUTES nao contem '/g'; '/explore' existe no :66 mas group 'IA'); src/features/admin/ui/RouteCheckboxGrid.tsx:11 (ROUTE_GROUPS=['Carteira','Risco','Operacional','Anexos'] omite 'IA', logo :14 filtra e nunca renderiza /explore nem /g); src/shared/lib/permissions/metric-route-map.ts:83-155 (todas covenants.* -> '/g')

P0 do spec. ALL_ROUTES nao lista '/g'; embora liste '/explore' (group 'IA'), o RouteCheckboxGrid so itera ROUTE_GROUPS sem 'IA', entao nem /explore nem /g aparecem como checkbox concedivel. Como todo o produto Vila Rosa vive em /g (64 covenants.* mapeadas para '/g' em metric-route-map.ts), um nao-admin nunca recebe a rota via UI. So @askliquid.com (admin bypass em useUserPermissions.tsx:45 / authorize.ts:43) enxerga. Bloqueia DoD-1 itens 2 e 4.

**Proposta:** Adicionar '/g' a ALL_ROUTES e incluir group 'IA' em ROUTE_GROUPS de RouteCheckboxGrid; permitir conceder /g via group.routes e clientAccess.routeOverrides

## `a4-cliente-permissoes-02` · Server checa rota '/g' exata; client checa pathname completo '/g/{gid}/r/{rid}' - strings nunca coincidem

| Campo | Valor |
|---|---|
| Origem | #3 · Δ sev: doc: media -> codigo: alta |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei as duas camadas de ponta a ponta. Server: metric-route-map.ts:83-154 mapeia as 64 covenants.* para o literal '/g'; execute-metric.ts:150-153 chama verifyRouteAccess (api-auth.ts:218-254) que delega a canAccessRoute (authorize.ts:47-48) com .includes(route) EXATO. Client: DashboardLayout.tsx:70,80 renderiza ProtectedRoute sem requiredPath (grep confirma que nenhum caller no repo passa requiredPath), logo ProtectedRoute.tsx:25 usa o pathname completo '/g/{gid}/r/{rid}' e useUserPermissions.tsx:164-171 compara com .includes() exato — '/g/{gid}/r/{rid}' nunca é igual a '/g'. Caminho de dados fecha o loop: ReportPage -> useReportData.ts:72 -> POST /api/metrics/batch -> executeMetric, ou seja, o mesmo input (não-admin abrindo /g/{gid}/r/{rid}) atinge os dois sites. Tentativas de refutação falharam: não há middleware.ts no app, nenhuma normalização de path (startsWith/normalizeRoute) em src/, ReportPage não tem ProtectedRoute próprio, e ALL_ROUTES (types.ts:55-70) não oferece '/g' nem paths dinâmicos (achado #2, blocked-by declarado). Só admin e embeddedMode passam, como o achado já reconhece. Cenário alcançável por ator real: não-admin com '/g' concedido (pós-#2 ou via console) seria autorizado pelo servidor mas bloqueado pelo ProtectedRoute (redirect via baseRoutes.find ou render null); o inverso (armazenar o path completo) passa no client e toma 403 nas métricas. Severidade pela regra do §5 do spec: funcional + ativo + bloqueia DoD-1 itens 3 e 4 (o §3 do spec codifica este exato achado como critério, e o §8 o inclui no P0 do WS-1) -> alta; o delta doc:média -> código:alta está correto. [src/shared/hooks/useUserPermissions.tsx:169 (includes exato no client) vs src/shared/lib/permissions/authorize.ts:47-48 (includes exato no server com route='/g' vindo de metric-route-map.ts:157), com ProtectedRoute.tsx:25 usando pathname completo por DashboardLayout.tsx:70,80 não passar requiredPath] |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | inconsistencia / L2 |
| Estágio | E8 (afeta: E9) |
| Componente | /g/{groupId}/r/{reportId} (ProtectedRoute vs executeMetric) |
| DoD / Esforço | DoD-1 / M |
| Causa-raiz | `route-match-granularidade-server-vs-client` · dep: blocked-by #2 · ADR: ADR-0006 |

**Evidência:** src/shared/lib/permissions/metric-route-map.ts:157 routeForMetric->'/g' + src/shared/lib/metrics/execute-metric.ts:150-153 (verifyRouteAccess com route='/g' exato) + src/shared/lib/permissions/authorize.ts:47-48 (ca.routeOverrides.includes(route) / computeBaseRoutes.includes(route), match exato); LADO CLIENTE: src/features/auth/ui/ProtectedRoute.tsx:25 pathToCheck=pathname (='/g/{groupId}/r/{reportId}') e :32,:67 canAccessRoute(activeClientId, pathToCheck); src/shared/hooks/useUserPermissions.tsx:164-171 (includes exato); src/app/layouts/DashboardLayout.tsx:70,80 nao passa requiredPath

As duas camadas comparam granularidades diferentes: servidor exige literal '/g' em routeOverrides/group.routes; cliente exige o pathname inteiro. Mesmo que #2 fosse corrigido concedendo '/g', o ProtectedRoute do cliente ainda bloquearia (redirect) porque '/g/abc/r/xyz' !== '/g'. So o admin (short-circuit isAdmin) passa em ambos. Bloqueia DoD-1 item 3 e 4.

**Proposta:** Normalizar para uma unica string canonica: derivar '/g' do pathname no client (ex.: pathname.startsWith('/g') -> '/g') OU passar requiredPath='/g' no DashboardLayout para paginas /g, espelhando routeForMetric

## `a4-cliente-permissoes-03` · Embedded mode concede isAdmin=true incondicional e bypassa ProtectedRoute; handler postMessage sem checar origin

| Campo | Valor |
|---|---|
| Origem | #5 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei toda a evidencia no codigo atual e ela bate linha a linha: useUserPermissions.tsx:45 concede isAdmin=true incondicional quando embeddedMode (e canAccessClient:158-159 / canAccessRoute:164-165 retornam true para isAdmin); ProtectedRoute.tsx:61 retorna children antes de qualquer checagem quando embeddedMode; AuthProvider.tsx:54-59 aceita AUTH_TOKEN sem validar event.origin (grep de event.origin em src/ = 0 ocorrencias) e :64 envia AUTH_READY com targetOrigin '*'. Busca por mitigacoes em outras camadas nao refuta: (1) nao existe middleware.ts nem guard server-side de pagina — ProtectedRoute e o unico gate do plano de UI/rota, cumprindo o padrao de evidencia 'unico gate' do par. 6 do spec para a claim de elevacao de UI; (2) next.config.ts:5-17 define apenas COOP, sem frame-ancestors/X-Frame-Options — qualquer site pode embedar e disparar o bypass, cenario alcancavel por ator real (parent malicioso ou shell legitimo com token nao-admin); (3) a mitigacao server-side que o achado ja credita e real (api-auth.ts:45-70 verifyIdToken + verifyDatasetAccess/verifyClientAccess/verifyRouteAccess fail-closed, usados em 25 rotas), mas cobre so o plano de dados, nao a elevacao de UI nem o handler sem origin-check; (4) o proprio doc do projeto (docs/embedded-mode-postmessage-auth.md:103-115 e 287-292) admite exatamente esses tres riscos como POC com fixes 'necessarios para producao' nao implementados. Severidade: par. 5 do spec deriva mecanicamente alta (dimensao=seguranca + estado=ativo), e o achado bloqueia DoD-1 item 8 verbatim (spec:41), sendo item-ancora do WS-1 (spec:178). [src/shared/hooks/useUserPermissions.tsx:45; src/features/auth/ui/ProtectedRoute.tsx:61; src/features/auth/providers/AuthProvider.tsx:54-64; next.config.ts:5-17 (sem frame-ancestors); src/shared/lib/api-auth.ts:45-70 (mitigacao so no plano de dados)] |
| Severidade / Dimensão / Estado | **alta** / seguranca / ativo |
| Tipo / Lente | bug / L2 |
| Estágio | E8 (afeta: E9, E10) |
| Componente | embedded mode (iframe) - useUserPermissions / ProtectedRoute |
| DoD / Esforço | DoD-1 / M |
| Causa-raiz | `embedded-mode-admin-incondicional` · ADR: ADR-0006 |

**Evidência:** src/shared/hooks/useUserPermissions.tsx:45 (isAdmin = embeddedMode ? true : ...) -> canAccessRoute :164-165 (isAdmin=>true) e canAccessClient :158-159; src/features/auth/ui/ProtectedRoute.tsx:61 (if (embeddedMode) return children -> bypassa toda checagem); ativado por postMessage sem verificacao de origem em src/features/auth/providers/AuthProvider.tsx:52-64 (window.parent.postMessage(...,'*') e handler aceita qualquer origin)

Confirmado no cliente: embeddedMode torna isAdmin=true e ProtectedRoute libera todos os filhos. MITIGACAO server-side: fetches usam o external token (getExternalToken) via verifyAuthToken, entao dados continuam gated pelo email real do token pai (api-auth.ts:45-70). Residual: (a) elevacao de UI/estrutura de paginas restritas mesmo com token nao-admin; (b) o handler postMessage em AuthProvider.tsx:54 nao valida event.origin, entao qualquer parent frame pode injetar AUTH_TOKEN. DoD-1 item 8 exige bypass contido/escopado - hoje nao esta.

**Proposta:** Escopar embedded ao tenant do token pai (nao isAdmin=true global); validar event.origin no handler de AUTH_TOKEN; manter enforcement de rota/tenant baseado no token real

## `a4-cliente-permissoes-04` · Bypass de dev promove request nao-autenticado a admin (dev@askliquid.com) quando NODE_ENV=development

| Campo | Valor |
|---|---|
| Origem | #4 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei toda a evidencia e ela bate exatamente. isDevAuthBypassEnabled (runtime-config.ts:37-45) liga com NODE_ENV=development + (emulador OU FIREBASE_ADMIN_PRIVATE_KEY ausente); DEV_BYPASS_EMAIL=dev@askliquid.com (runtime-config.ts:11-17) passa isAdminEmail (runtime-config.ts:32-35), que curto-circuita verifyDatasetAccess/verifyClientAccess/verifyRouteAccess (api-auth.ts:97,190,223) como admin. Os tres fail-opens em api-auth.ts:48,54,67 (inclusive token INVALIDO no catch) e em require-admin.ts:40,45,53 existem como alegado. Nao ha mitigacao a montante: nao existe middleware.ts no app, e o mesmo padrao de bypass esta duplicado em mais 8 rotas (data-sources, products, metrics, metrics/rename, data-contracts+entities+attributes, schema-detect/v2:38). Cenario alcancavel por ator real: .env.example:12 nem define FIREBASE_ADMIN_PRIVATE_KEY (setup padrao usa GOOGLE_APPLICATION_CREDENTIALS), logo o bypass fica ATIVO no dev default, e o dev server conecta ao Firestore de producao via ADC — request nao-autenticado vira admin sobre dados reais. Contencao em producao confirmada: Dockerfile:73 ENV NODE_ENV=production + standalone server.js, coerente com a lista de regressao do spec §3 (linha 58). A proposta do achado tambem procede: nenhum teste cobre isDevAuthBypassEnabled diretamente — todos mockam (api-auth.test.ts:26, require-admin.test.ts:19), nao existe runtime-config.test.ts. Estado=latente e correto (footgun real, contornado em producao por construcao). [src/shared/lib/runtime-config.ts:37-45; src/shared/lib/api-auth.ts:48,54,67,97; src/shared/lib/auth/require-admin.ts:40,45,53; Dockerfile:73; docs/superpowers/specs/2026-07-21-revisao-remediacao-design.md:58,133] |
| Severidade / Dimensão / Estado | **media** / seguranca / latente |
| Tipo / Lente | bug / L2 |
| Estágio | E8 (afeta: E10, OPS) |
| Componente | /api/* (verifyAuthToken / requireAdmin) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `dev-auth-bypass-node-env` |

**Evidência:** src/shared/lib/runtime-config.ts:37-45 (isDevAuthBypassEnabled: NODE_ENV==='development' && (emulator || !FIREBASE_ADMIN_PRIVATE_KEY)); src/shared/lib/api-auth.ts:48,54,67 (retorna DEV_BYPASS_EMAIL=dev@askliquid.com, que passa isAdminEmail); src/shared/lib/auth/require-admin.ts:40,45,53 (retorna uid dev sem token)

Confirmado o fail-open, porem contido: em producao NODE_ENV=production -> isDevAuthBypassEnabled()=false. Consta da lista de regressao do spec (par.3) como 'off em producao por construcao' - nao e gap de release, e footgun latente. Severidade codigo=media (seguranca+latente), igual a doc.

**Proposta:** Manter (esta contido por construcao: exige NODE_ENV=development); opcional adicionar assercao explicita/telemetria e teste que garante off em production

## `a4-cliente-permissoes-05` · UI so produz formato novo (productBindings) e nao edita 'dataset'; 4 clientes legados nao round-trip pela Admin UI

| Campo | Valor |
|---|---|
| Origem | #6 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | inconsistencia / L1 |
| Estágio | E6 (afeta: E2) |
| Componente | /api/clients (ClientForm vs seed legado) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `cliente-formato-legado-vs-novo-ui-so-novo` |

**Evidência:** src/features/admin/ui/ClientForm.tsx:104-107 (exige bindings.length>=1, nunca expoe campo 'dataset') e :112-117 (onSave so envia productBindings, sem dataset); scripts/seed-firestore.mjs:26-55 (om/brz/conx/imcasa so tem 'dataset', zero productBindings); schema aceita ambos em src/shared/schemas/client.ts:21-25

Confirmado. A criacao de cliente NOVO via UI funciona (DoD-1 #1 ok), mas os 4 clientes legados so tem 'dataset' e a ClientForm nao os representa/edita (perde o campo em qualquer save via UI, pois onSave omite dataset e a API so persiste dataset se enviado - clients/route.ts:119). Migracao incompleta; latente porque Vila Rosa usa formato novo. Relacionado a paridade WS-2. NOTA de shape: makeDatasetBinding (make-dataset-binding.ts:15-24) nao emite tableBindings, que o seed-vila-rosa emite (linha 224/238); benigno hoje pois resolve-metric trata ausencia como identidade, mas a UI nao permite onboardar cliente com tabela != entidade.

**Proposta:** Ou migrar om/brz/conx/imcasa para productBindings, ou expor leitura/edicao do campo legado 'dataset' na ClientForm para paridade de round-trip

## `a4-cliente-permissoes-06` · enabledIndicators restringe apenas surfacing IA, nao a execucao de metrica via /api/metrics

| Campo | Valor |
|---|---|
| Origem | #8 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | lacuna / L2 |
| Estágio | E6 (afeta: E4, E10) |
| Componente | enabledIndicators (semantic context vs executeMetric) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `enabledIndicators-so-gateia-surfacing` |

**Evidência:** src/shared/repositories/client-semantic-context.ts:57-67 (collectMetricIds aplica enabledIndicators como interseccao) e :124 (so afeta o surfacing semantico/IA); src/shared/lib/metrics/execute-metric.ts:137-153,234-235 (owner + rota + dataset/coverage; NENHUMA leitura de enabledIndicators)

Confirmado: executeMetric nunca consulta enabledIndicators; restringir a lista nao impede executar a metrica se owner/rota/dataset/coverage passarem. Latente hoje pois Vila Rosa usa enabledIndicators=null (todas) em ambos os bindings (seed-vila-rosa-client.mjs:227,242). Footgun de configuracao: admin que 'desabilitar' um indicador esperando bloquear acesso nao bloqueia a API.

**Proposta:** Se enabledIndicators deve ser gate de execucao, cruza-lo tambem em executeMetric antes de resolver; senao documentar explicitamente que e apenas surfacing

## `a4-cliente-permissoes-07` · Dataset roteado por contractRef (prefixo de requires[0]), nao por productId; contractRef errado = 422 silencioso

| Campo | Valor |
|---|---|
| Origem | #9 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | lacuna / L4 |
| Estágio | E6 (afeta: E4) |
| Componente | executeMetric single-contract (contractRef) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `contractref-roteia-dataset-nao-productid` |

**Evidência:** src/shared/lib/metrics/execute-metric.ts:210 (metricContractId = metric.requires[0].split('.')[0]) e :211-224 (busca dataset por contractRef===metricContractId; senao fail(422)); seed-vila-rosa-client.mjs:221,235 (contractRef 'liquid-play'/'liquid-play-plus' == prefixo dos requires)

Confirmado. Escolher contractRef divergente do prefixo de requires faz TODA metrica do contrato falhar 422 ('Nenhum dataset do cliente cobre o contrato'). Armadilha de config no onboarding. Latente porque Vila Rosa foi seedado corretamente (o proprio cabecalho do seed:17-46 documenta o cuidado de usar contractRef=liquid-play-plus). makeDatasetBinding:18 ja evita o literal 'canonical' antigo (G2).

**Proposta:** Validar no onboarding (schema-detect/ClientForm) que cada contractRef bate com o prefixo dos requires das metricas do produto; mensagem de erro mais explicita no 422

## `a4-cliente-permissoes-08` · Perfil auto-criado no login nasce sem permissao (fail-closed correto); onboarding de usuario e obrigatoriamente manual

| Campo | Valor |
|---|---|
| Origem | #10 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei toda a evidencia: (1) useAuth.ts fetchProfile cria perfil novo com groups:[] e clientAccess:[] quando nao ha doc por UID (linhas 41-45) nem por email (47-62) — o auto-create vazio so ocorre sem pre-provisionamento, confirmando 'onboarding obrigatoriamente manual'; (2) fail-closed confirmado no client (ProtectedRoute.tsx:81-90, EmptyState 'Sem permissao' com baseRoutes vazio) e no server (api-auth.ts:129-137 e 161-166 retornam 403 para clientAccess vazio; authorize-metric.ts:16-23 delega ao mesmo check) — sustenta alsoAffects E6; (3) unica imprecisao: em authorize.ts o `!ca => false` esta na linha 46, nao 44 (linha 44 e `!user => false`) — drift de 2 linhas, mesmo bloco fail-closed; (4) nenhuma mitigacao oculta: POST /api/users (users/route.ts:104-111) so grava doc Firestore (sem createUser/convite), grep de setCustomUserClaims em src/ vazio (claims so via script manual grant-claims), e o unico bypass e isAdminEmail por dominio @askliquid.com (runtime-config.ts:32-35), irrelevante para o usuario externo nao-admin do DoD-1; (5) cenario alcancavel por ator real: signInWithPopup com GoogleAuthProvider generico sem restricao hd (useAuth.ts:17-18,104-113) ou email/senha — primeiro login sem doc pre-criado grava o perfil orfao. Sobre severidade (par. 5 do spec): o comportamento descrito nao e defeito — e exatamente o que DoD-1 #7 exige (o proprio spec cita ProtectedRoute.tsx:81-90 como satisfazendo o criterio); o residuo acionavel e apenas runbook/doc, e o peso de bloqueio do DoD-1 #6 pertence ao achado irmao 'provisionamento-credencial-ausente' (dependencias ja liga). Baixa e correta na substancia, mas a tupla dimensao:funcional + dod:DoD-1 + severidade:baixa contradiz a tabela de derivacao do par. 5 (funcional+ativo+DoD => alta); recomendo ao consolidador reclassificar dimensao para 'doc' (ou dod para 'nenhum'), mantendo severidade baixa. [src/features/auth/model/useAuth.ts:65-77; src/features/auth/ui/ProtectedRoute.tsx:81-90; src/shared/lib/permissions/authorize.ts:45-46; src/shared/lib/api-auth.ts:129-137,161-166; app/api/users/route.ts:104-111; src/shared/lib/runtime-config.ts:32-35] |
| Severidade / Dimensão / Estado | **baixa** / funcional / ativo |
| Tipo / Lente | lacuna / L4 |
| Estágio | E8 (afeta: E6) |
| Componente | login / criacao de perfil (useAuth) |
| DoD / Esforço | DoD-1 / P |
| Causa-raiz | `provisionamento-usuario-manual-fail-closed` · dep: blocks provisionamento-credencial-ausente |

**Evidência:** src/features/auth/model/useAuth.ts:66-77 (novo perfil com groups:[], clientAccess:[]) ; fail-closed correto confirmado em ProtectedRoute.tsx:81-90 e authorize.ts:44 (!ca => false)

Confirmado e correto por seguranca (fail-closed satisfaz DoD-1 #7). O 'defeito' e apenas que o onboarding depende de acao admin posterior (UI ou seed). Liga-se diretamente ao gap de provisionamento (createUser ausente) reportado como 'novo'.

**Proposta:** Nao alterar o fail-closed (e regressao positiva DoD-1 #7); documentar/expor no runbook o fluxo de vincular clientAccess apos primeiro login - ver achado de provisionamento

## `a4-cliente-permissoes-09` · Dois 'grupos' distintos: coleção raiz groups (RBAC) e subcoleção clients/{id}/groups (navegação)

| Campo | Valor |
|---|---|
| Origem | #7 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L1 |
| Estágio | E8 (afeta: E7) |
| Componente | collection('groups') vs clients/{id}/groups |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `dois-conceitos-grupo-mesmo-termo` |

**Evidência:** app/api/groups/route.ts:18 (db.collection('groups') - RBAC de rotas) vs app/api/report-groups/route.ts:28 (clients/{clientId}/groups - navegacao de reports, campos name/order)

Confirmado: mesmo termo, colecoes e semanticas diferentes (permissao vs navegacao de reports). Fonte provavel de confusao no onboarding, sem impacto funcional. Baixa.

**Proposta:** Renomear conceitualmente na doc/tipos (ex.: 'permissionGroups' vs 'reportGroups') para eliminar ambiguidade; sem mudanca de dados

## `a4-cliente-permissoes-10` · Docs (CLAUDE.md) e tipos @deprecated citam /api/bigquery como fonte de dados, mas a rota nao existe mais

| Campo | Valor |
|---|---|
| Origem | #1 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L4 |
| Estágio | E6 (afeta: OPS) |
| Componente | CLAUDE.md / @deprecated types (rota /api/bigquery) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `doc-api-bigquery-descontinuada` |

**Evidência:** app/api/bigquery/route.ts: glob=0 (rota nao existe mais); CLAUDE.md:71-72 ainda descreve 'fetchBigQuery(action,params)' POST /api/bigquery como data flow; src/features/admin/model/types.ts:4,15 (@deprecated citando '/api/bigquery - G9'); tipo ainda IMPORTADO em src/shared/lib/bigquery/schema-resolver.ts:6 e queries.ts:3

Confirmado doc-drift: a rota /api/bigquery foi descontinuada (filter-options/route.ts:13 diz 'Substitui a antiga rota /api/bigquery'), porem CLAUDE.md ainda a documenta como caminho real e os tipos @deprecated permanecem importados (nao sao codigo-morto - schema-resolver/queries.ts ainda usam ClientSchema). Baixa.

**Proposta:** Atualizar CLAUDE.md secao Data Flow para descrever /api/metrics/batch (camada semantica); avaliar remocao dos tipos @deprecated (ClientSchema) ainda consumidos por bigquery/queries.ts e schema-resolver.ts

## `a4-cliente-permissoes-11` · Regras Firestore deixam clients/{id}/groups e /reports com write para qualquer usuario autenticado (cross-tenant IDOR)

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei toda a cadeia. (1) firestore.rules:38-44 diz literalmente o que o achado alega: subcoleções clients/{clientId}/groups/{groupId} e .../reports/{reportId} com `allow read, write: if request.auth != null` — sem tenantMatches() (helper existe nas linhas 25-29 mas não é usado ali) e sem checagem de admin; o comentário nas linhas 36-37 documenta o CRUD aberto como intencional. Contraste confirmado com a linha 34 (write de clients/{clientId} só admin). (2) As regras são as deployadas: firebase.json:2-7 aponta firestore.rules para a database liquid-play-dataviz (storage canônico de produção). (3) Nenhuma mitigação em outra camada: as rotas API (app/api/report-groups/route.ts:19,57,95,129 e app/api/reports/route.ts:26,111,250,290) fazem verifyClientAccess fail-closed (api-auth.ts:182-207), mas só protegem o caminho HTTP; grep por AppCheck em src/ = zero; o client SDK Firestore é inicializado no bundle com config pública NEXT_PUBLIC_* na mesma database (src/shared/lib/firebase/config.ts:6-13,38-48) — as regras são o único gate no caminho SDK-direto, atendendo o padrão de evidência de segurança do §6 do spec (cenário + linha fail-open + único gate). (4) Ator real alcançável: qualquer usuário não-admin de qualquer tenant (persona central do DoD-1) ou conta órfã (DoD-1 #7) satisfaz request.auth != null e pode ler/escrever/deletar groups e reports de QUALQUER cliente — cross-tenant IDOR ativo de leitura e escrita (read também vaza blockMap/queries/metricRefs de outros tenants). A proposta do achado (tenantMatches via claim clientId no path ou admin) é coerente com o modelo já usado nas coleções server-managed do mesmo arquivo. [C:\Projetos\liquid-dataviz\firestore.rules:38-44 (li o arquivo inteiro; fail-open confirmado), cruzado com firebase.json:5 (regras deployadas na database liquid-play-dataviz) e src/shared/lib/firebase/config.ts:38-48 (client SDK na mesma database, superfície de ataque real)] |
| Severidade / Dimensão / Estado | **alta** / seguranca / ativo |
| Tipo / Lente | bug / L2 |
| Estágio | E7 (afeta: E6, E8) |
| Componente | firestore.rules clients/{id}/groups e /reports |
| DoD / Esforço | DoD-1 / M |
| Causa-raiz | `firestore-rules-subcolecoes-cliente-write-aberta` · ADR: ADR-0006 |

**Evidência:** firestore.rules:38-44 (match /clients/{clientId}/groups/{groupId} e .../reports/{reportId}: allow read, write: if request.auth != null) - qualquer usuario autenticado le/escreve reports de QUALQUER cliente; contraste com clients doc :34 (write so admin) e o enforcement de API report-groups/route.ts:57 (verifyClientAccess) que e bypassavel indo direto ao client SDK

Descoberto na varredura. As rotas de API (report-groups) fazem verifyClientAccess, mas as regras Firestore sao a defesa final e estao abertas: um usuario autenticado nao-admin (ate conta orfa) pode escrever/deletar reports e grupos de navegacao de QUALQUER cliente via client SDK direto, bypassando a API. Cross-tenant write ativo. dimensao seguranca + ativo => alta.

**Proposta:** Restringir write das subcolecoes groups/reports a admin OU a tenantMatches (clientId no path == clientAccess/claim do usuario); nao confiar apenas no gate de API que o client SDK contorna

## `a4-cliente-permissoes-12` · Nao ha fluxo no app para criar a credencial do usuario nem setar o claim clientId; onboarding exige console Firebase + script manual

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei toda a evidência: POST /api/users só faz ref.set do doc Firestore (route.ts:104-111), sem getAuth().createUser nem invite (grep createUser=0 no app; únicos hits são createUserContent do GenAI SDK em adrs/gen-ai.md:259,269); setCustomUserClaims só existe no script manual scripts/grant-claims.ts:100, nunca importado pelo app; firestore.rules:25-29 exige token.clientId enquanto api-auth.ts:134-135/162-164/201-202 autoriza por clientAccess[] do doc — modelo duplo confirmado; require-admin.ts:59-60 tem o fallback por email; useAuth.ts:131 tem reset de senha mas sendPasswordResetEmail não cria conta. Mitigação parcial encontrada: signInWithPopup Google (useAuth.ts:104-113) auto-cria a credencial Auth no primeiro login e fetchProfile (useAuth.ts:47-63) vincula o doc por email — mas só cobre emails com conta Google; usuário email/senha (signInWithEmailAndPassword, useAuth.ts:119) não loga sem conta criada no console, e não há runbook em docs/ nem rota de invite (grep=0). Cenário alcançável: admin cria usuário na UI, usuário externo não-Google não consegue logar; DoD-1 #6 do spec (linha 39) cita exatamente este gap. Ressalva que não muda o veredito: a sub-alegação de que leituras client-SDK das coleções server-managed falham sem o claim é hoje inalcançável no código — nenhum uso de getFirebaseDb toca workingMemory/embeddings*/sqlCatalog* (só useUserPermissions, conversations, useAuth; catálogo lê via /api/admin/sql-catalog, useSqlCatalog.ts:62) — logo essa parte é latente/futura, mas o achado-dono (ausência de fluxo de provisionamento de credencial+claim) é ativo. Severidade pela regra do §5: funcional + ativo + bloqueia DoD-1 → alta. [app/api/users/route.ts:104-111; src/features/auth/model/useAuth.ts:104-124,131; scripts/grant-claims.ts:100; firestore.rules:25-29; src/shared/lib/api-auth.ts:134-135; src/shared/lib/auth/require-admin.ts:59-60; src/shared/hooks/useSqlCatalog.ts:62; docs/superpowers/specs/2026-07-21-revisao-remediacao-design.md:39,129-133] |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | lacuna / L4 |
| Estágio | E8 (afeta: E6) |
| Componente | /api/users (criacao de credencial) + custom claim clientId |
| DoD / Esforço | DoD-1 / G |
| Causa-raiz | `provisionamento-credencial-ausente` · dep: blocked-by useAuth-fail-closed(#10) · ADR: ADR-0006 |

**Evidência:** app/api/users/route.ts:104-111 (POST so grava doc Firestore, nao cria credencial Auth); grep 'createUser'=0 em codigo do app (so aparece em adrs/gen-ai.md como funcao nao-relacionada do GenAI SDK); grant-claims.ts e script MANUAL fora do app; require-admin.ts:59-60 fallback por email; firestore.rules:25-29 tenantMatches exige token.clientId (custom claim) desconectado de clientAccess[] do doc

Descoberto na varredura (relacionado a #10). Dois problemas: (1) POST /api/users so cria o doc Firestore - a credencial Firebase Auth precisa ser criada fora do app (console), entao um usuario novo nao loga sem intervencao manual (bloqueia DoD-1 #6). (2) Modelo duplo: o app grava clientAccess[] no doc, mas as regras Firestore server-managed (workingMemory/embeddings/sqlCatalog) dependem do custom claim token.clientId, setado SO por grant-claims.ts manual. Criar usuario pela UI nao seta o claim -> leituras client-SDK dessas colecoes falham ate rodar o script. Reset de senha ja existe (useAuth.ts:131), o que ajuda parcialmente se a conta ja existir.

**Proposta:** Adicionar fluxo (UI/route) que cria o usuario Auth (getAuth().createUser ou invite/reset link) e provisiona o custom claim clientId ao gravar clientAccess, alinhando os dois modelos de permissao; documentar runbook

## `a4-cliente-permissoes-13` · seed-vila-rosa --force usa merge:false sem re-incluir createdAt; comentario afirma preservar mas o campo e apagado

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | **confirmado** — Re-tracei toda a evidencia. Em scripts/seed-vila-rosa-client.mjs, o caminho --force (linhas 281-283) grava `{ ...desired, updatedAt: now }` com `ref.set(payload, { merge: false })`, e `desired` (linha 263) = `{ ...CLIENT_BASE, productBindings }` onde CLIENT_BASE (linha 193) = `{ name: 'Vila Rosa', initial: 'V', color: '#E85D2C' }` — nenhum createdAt no payload; merge:false substitui o doc inteiro, apagando o campo, em contradicao direta com o comentario da linha 281 ('createdAt preservado'). O caminho de criacao (linhas 296-297) inclui createdAt corretamente. Nao ha mitigacao em outra camada: o script fala direto com Firestore via firebase-admin (linhas 73-74), sem passar por API/middleware; o schema ClientDoc (src/shared/schemas/client.ts:27) usa `createdAt: z.unknown()`, que aceita undefined — nada falha loud downstream (perda silenciosa). O contraste com a API tambem confere: app/api/clients/route.ts:116 usa `...(existing.exists ? {} : { createdAt: now })` + merge:true na linha 128 — padrao repetido em TODAS as rotas de upsert do repo (users, products, data-sources, data-contracts, relations, dashboard-templates), tornando o --force do seed a unica excecao. Cenario alcancavel: operador rodando `--apply --force` (uso documentado no header do script, linha 54) sobre o doc vila-rosa que ja existe em producao e diverge — requer acao deliberada, logo `latente` esta correto. Nota menor: o spec ja ancora esta classe de achado em WS-2 (spec linha 179 'createdAt zerado por merge:false') e o criterio de aceite WS-2 (linha 199) exige 'createdAt preservado', entao `dod: nenhum` e conservador; mas isso nao muda a severidade. [scripts/seed-vila-rosa-client.mjs:263,281-283,296-297 + scripts/seed-vila-rosa-client.mjs:193 (CLIENT_BASE sem createdAt) + app/api/clients/route.ts:116,128 + src/shared/schemas/client.ts:27 + docs/superpowers/specs/2026-07-21-revisao-remediacao-design.md:129-134 (derivacao: correcao-de-dado + latente = media)] |
| Severidade / Dimensão / Estado | **media** / correcao-de-dado / latente |
| Tipo / Lente | bug / L1 |
| Estágio | E6 |
| Componente | scripts/seed-vila-rosa-client.mjs (--force) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `seed-vila-rosa-force-descarta-createdat` |

**Evidência:** scripts/seed-vila-rosa-client.mjs:281 (comentario '...FORCANDO sobrescrita, createdAt preservado') vs :282-283 (const payload = { ...desired, updatedAt: now }; ref.set(payload, { merge: false })) - 'desired' (linha 263 = {...CLIENT_BASE, productBindings}) NAO contem createdAt, e merge:false substitui o doc inteiro

Descoberto na varredura (alinha-se a WS-2 'createdAt zerado por merge:false'). So dispara no re-seed com --force de um cliente existente; o caminho de criacao (linha 296-297) inclui createdAt corretamente. Divergencia codigo-vs-comentario + perda de metadado. A API /api/clients (clients/route.ts:116, merge:true) faz certo - inconsistencia entre seed e API.

**Proposta:** No caminho --force, ler existing.data().createdAt e incluir no payload (ou usar merge:true), de fato preservando createdAt como o comentario promete

## `a4-cliente-permissoes-14` · POST /api/users e /api/groups nao usam zod; routeOverrides e group.routes aceitam strings arbitrarias sem validar contra rotas conhecidas

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / config / latente |
| Tipo / Lente | lacuna / L1 |
| Estágio | E8 |
| Componente | /api/users, /api/groups (POST) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `write-routes-sem-zod-e-routeoverrides-nao-validado` |

**Evidência:** app/api/users/route.ts:49-55 (body via 'as' cast, sem zod) e :79-98 (valida clientId/groups refs mas NAO valida conteudo de routeOverrides - persistido cru em :108 via body.clientAccess); app/api/groups/route.ts:44-49 (body 'as' cast, routes:string[] persistido sem validar contra ALL_ROUTES); contraste com app/api/clients/route.ts:64 que usa ClientDoc.safeParse

Descoberto na varredura (checklist: validacao zod ausente em rota de escrita). Rotas admin-only entao risco baixo (sem privilege escalation por nao-admin), mas permite gravar rotas invalidas/typos silenciosamente. Nota: routeOverrides E persistido em runtime (spread do body) apesar de nao estar no type declarado :54, entao a concessao manual via API funcionaria - mas a UI nao gera '/g' (ver #2) e o client bloquearia (ver #3).

**Proposta:** Adicionar schema zod nas rotas de escrita de users/groups e validar routeOverrides/routes contra o conjunto canonico de rotas (que deve passar a incluir '/g')

---

# a6-ia — E10 Camada de IA

> **Varredura (resumo do auditor):** Cobri as 30 hipoteses #63-#92 do Apendice A (todas presentes como findings com origem #N), lendo o codigo real (linhas driftaram vs doc) e derivando severidade do codigo antes de comparar. Confirmei os 2 achados alta ativos: ModelTier mismatch (#86, POST rejeita 'flash' oferecido na UI; PATCH grava sem validar) e supervisor multi-agente ativo cujo framing de sub-agente quebra o stream do /api/chat (#63, confirmado nos conversores do @mastra/core: default -> throw 'Unknown chunk type'). Rebaixei #79 (approve guard opt-in) de alta->media (admin-only, defense-in-depth) e marquei sevDocDelta. Refutei parcialmente #70 (recall e consistente consigo mesmo -> plausivel) e #75/#77 (embeddingsBlocks/KB-global SAO consumidos por outro caminho). Varredura de falsos-negativos (par.6.3): sem literais GCP hardcoded, sem branch NODE_ENV e sem fail-open na superficie E10. Novos achados: (1) BQML KNOWN_CLIENTS omite vila-rosa -> crash runtime para o tenant da branch (dobrado em #91); (2) gating de tools POR CLIENTE inexistente (DoD-2 #3); (3) orchestrator-metrics stub permanente (DoD-2 #8); (4) /api/firecrawl + search_web sem gate admin/rate-limit/custo (DoD-2 #8). Tracei o call-path save->load->getModel para o ModelTier. NAO deu tempo de: rodar vitest nos testes de conversores para reproduzir #63 dinamicamente; auditar a fundo os scorers/evals (builtin) alem dos entrypoints; revisar isolamento de tenant no DELETE de kb/[id]/docs (docId nao validado contra o KB do path — potencial cross-KB delete admin-only, baixa) e as demais tools BQML/simulation individualmente.

## `a6-ia-01` · Enum ModelTier diverge: schema tem 'slow' e rejeita 'flash'; runtime/UI tem 'flash' e ignora 'slow'

| Campo | Valor |
|---|---|
| Origem | #86 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | inconsistencia / L3 |
| Estágio | E10 (afeta: OPS) |
| Componente | /api/ai-studio/agents (POST), AiAgentsTab |
| DoD / Esforço | DoD-2 / P |
| Causa-raiz | `modeltier-schema-runtime-mismatch` |

**Evidência:** src/shared/schemas/ai-studio/agent.ts:5 (enum ['router','fast','slow','reasoning']); src/shared/config/agents/types.ts:51 e src/features/ai-agents/model-registry.ts:10-18 e src/features/ai-studio/admin/ui/AiAgentsTab.tsx:14 (['router','fast','flash','reasoning']); src/features/ai-agents/mastra/create-mastra-agent-from-config.ts:39 (VALID_TIERS sem 'slow'); src/features/ai-studio/repo.ts:104 (upsert valida docSchema) vs :137-152 (patch NAO valida)

Criar agente novo com model='flash' (opcao oferecida no dropdown UI, AiAgentsTab.tsx:14) faz o POST->repo.upsert->AiAgentDoc.parse falhar (500 'Erro ao salvar') pois 'flash' nao esta no enum do schema (agent.ts:5). Ja 'slow' esta no schema mas nao no model-registry nem no dropdown; se chegar ao runtime, create-mastra-agent-from-config.ts:41 cai no defaultModelTier silenciosamente. Observou-se ainda que o PATCH (repo.ts:137-152) so copia editableOnPatch SEM re-validar o schema, entao editar agente existente para 'flash' via PATCH grava sem validacao e funciona no load - inconsistencia entre caminhos POST vs PATCH. Bloqueia DoD-2 item 2.

**Proposta:** Unificar o enum numa unica fonte (['router','fast','flash','reasoning']), remover 'slow', e alinhar schema Zod, config/agents/types e model-registry; validar model tambem no PATCH.

## `a6-ia-02` · Supervisor multi-agente e o caminho ativo do /api/chat; chunks de framing de sub-agente nao sao tratados e quebram o stream

| Campo | Valor |
|---|---|
| Origem | #63 · Δ sev: doc: media -> codigo: alta |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **alta** / funcional / ativo |
| Tipo / Lente | bug / L3 |
| Estágio | E10 |
| Componente | /api/chat |
| DoD / Esforço | DoD-2 / M |
| Causa-raiz | `supervisor-multiagente-ativo-stream-nao-tratado` · ADR: ADR-0014 |

**Evidência:** app/api/chat/resolve-chat-agent.ts:44-50 (constroi supervisor com subAgents quando ha workflow); src/features/ai-studio/seed/manifest.ts:47-54 (seed cria workflow default isDefault=true); app/api/chat/route.ts:12-15 (docstring diz 'agente unico descritivo') vs :157-174 (loop converte TODO chunk sem filtrar framing de sub-agente); node_modules/@mastra/core/dist/chunk-DDFT2H3T.js:~21816 (emite 'agent-execution-event-*' from NETWORK) e :253 (convertFullStreamChunkToUIMessageStream default -> throw 'Unknown chunk type')

Contra o docstring da rota e a ADR-0014, resolveChatAgent SEMPRE constroi o supervisor com os 8 sub-agentes quando loadWorkflows()>0, e o seed garante um workflow default ativo -> caminho de producao e o supervisor. Ao delegar, o Mastra emite chunks de framing (agent-execution-start/-event-*) que caem no default de convertMastraChunkToAISDKv5 ({type,...payload}) e depois no default de convertFullStreamChunkToUIMessageStream, que lanca 'Unknown chunk type' -> rejeita a Promise do execute -> stream quebra no useChat (bate com o bug conhecido chat-stream-mastra-aisdk-bug e DoD-2 item 5). Cobre tambem a raiz da observacao de memoria do repo.

**Proposta:** Filtrar/converter os chunks 'agent-execution-*'/from:'AGENT' no loop do /api/chat (mapear inner chunk ou pular framing) antes do writer.write; extrair o loop para funcao testavel.

## `a6-ia-03` · Guard multi-tenant do approve e opt-in: omitindo clientId, a checagem de tenant e pulada

| Campo | Valor |
|---|---|
| Origem | #79 · Δ sev: doc: alta -> codigo: media |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / seguranca / latente |
| Tipo / Lente | lacuna / L2 |
| Estágio | E10 |
| Componente | /api/admin/sql-catalog/[id]/approve |
| DoD / Esforço | DoD-2 / P |
| Causa-raiz | `approve-tenant-guard-opt-in` · ADR: ADR-0009 |

**Evidência:** app/api/admin/sql-catalog/[id]/approve/route.ts:57-62 (guard so dispara se body.clientId for string nao-vazia); :34-36 (requireAdmin global via isAdminEmail); src/shared/lib/auth/require-admin.ts:60-66

O endpoint e admin-only (requireAdmin, global @askliquid.com), logo o vetor real e defense-in-depth contra admin aprovar query para tenant errado, nao exposicao externa - por isso rebaixei de alta (doc) para media. Ainda assim viola DoD-2 item 4 que exige enforcement (400 quando ausente + 403 em mismatch). O proprio spec (WS-4) reconhece esforco P.

**Proposta:** Tornar clientId obrigatorio (400 sem ele) e sempre comparar com existing.client_id (403 em mismatch) — enforce, nao opt-in, conforme DoD-2 item 4.

## `a6-ia-04` · Tres allowlists de clientId divergentes; BQML omite vila-rosa e crasha em runtime para o tenant em onboarding

| Campo | Valor |
|---|---|
| Origem | #91 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / ativo |
| Tipo / Lente | inconsistencia / L3 |
| Estágio | E10 (afeta: E7) |
| Componente | runtime IA / BQML tools |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `client-id-allowlists-divergentes` · ADR: ADR-0007 |

**Evidência:** src/shared/config/agents/types.ts:6 (ClientId = 'OM'|'BRZ'|'CONX'|'IMCASA', sem vila-rosa); src/shared/config/business-context/schemas.ts:3 (CLIENT_IDS inclui 'vila-rosa'); src/features/ai-agents/tools/bqml/multi-tenancy.ts:3-15 (KNOWN_CLIENTS ['om','brz','conx','imcasa'] -> normalizeClient lanca 'Invalid client id: vila-rosa')

Alem do type-level drift da observacao (#91), a varredura achou um TERCEIRO conjunto: BQML KNOWN_CLIENTS (multi-tenancy.ts:3) que NAO inclui vila-rosa. tool-registry.ts:144-149 passa ctx.clientId a deriveBqmlDataset/normalizeClient; com clientId='vila-rosa' qualquer tool BQML (list/create/forecast/predict/detect) lanca 'Invalid client id: vila-rosa' -> BQML totalmente quebrado para o cliente da branch. Manifestacao ativa (funcional) embora BQML possa nao estar provisionado por ADR-0007. config/agents/types.ts ClientId e usado por RequestContext mas AgentDynamicContext.clientId e string frouxa, entao o type-drift em si e latente.

**Proposta:** Centralizar a lista canonica de tenants (fonte unica) e derivar ClientId, CLIENT_IDS e KNOWN_CLIENTS dela; incluir vila-rosa onde aplicavel.

## `a6-ia-05` · CLIs de evals/drift nunca persistem (dryRun=true / persist:false fixos); paineis leem colecoes sempre vazias

| Campo | Valor |
|---|---|
| Origem | #81 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L5 |
| Estágio | OPS (afeta: E10) |
| Componente | /api/admin/eval-runs, /api/admin/judge-drift |
| DoD / Esforço | DoD-2 / M |
| Causa-raiz | `evals-drift-cli-nao-persiste` · ADR: ADR-0010 |

**Evidência:** src/features/evals/runner/run-evals.ts:81 (dryRun=true default) + :206-222 (parseArgs so seta dryRun=true, sem flag p/ false) + :40-44 (DEFAULT_AGENT_OUTPUT stub 'SELECT 1'); src/features/evals/drift/detect-drift.ts:174 (main chama detectDrift com persist:false hardcoded)

runEvals tem dryRun=true por default e o parseArgs so ativa --dry-run (nunca desativa) -> jamais persiste em evalRuns via CLI, e ainda avalia contra DEFAULT_AGENT_OUTPUT (stub), nao o agente real. detect-drift main() fixa persist:false. Como as rotas admin/eval-runs e admin/judge-drift so LEEM evalRuns/judgeDrift, os paineis retornam vazio/stub em producao. Bloqueia DoD-2 item 7 (evals+drift rodam/gravam/exibem — gravam esta quebrado).

**Proposta:** Adicionar flag --persist (invertendo o default seguro) no run-evals e propagar persist configuravel no detect-drift main; wire de agentOutput real em vez do stub.

## `a6-ia-06` · Gate de custo BQML usa rowCount/rowWidth fixos; so o bytesGate (dry-run) e dinamico

| Campo | Valor |
|---|---|
| Origem | #84 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | bug / L5 |
| Estágio | E10 |
| Componente | bqml_create_or_use_model (needsApproval) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `bqml-cost-gate-hardcoded` · ADR: ADR-0007 |

**Evidência:** src/features/ai-agents/tools/bqml/create-or-use-model.ts:118-129 (estimateCost com rowCount:100_000, rowWidthBytes:100 hardcoded; costGate/bytesGate; so bytes vem de dry-run)

O costGate compara cost.costUsd (derivado de 100k linhas x 100 bytes fixos) contra BQML_APPROVAL_COST_USD; so bytes vem do dry-run real (estimateBytes). Para tabelas grandes/pequenas a estimativa de custo pode nao refletir o custo real de CREATE MODEL, aprovando ou barrando incorretamente.

**Proposta:** Estimar rowCount/rowWidth a partir do dry-run/schema da fonte em vez de constantes, ou documentar explicitamente a heuristica como limite conhecido.

## `a6-ia-07` · Reranker nao tem timeout de 5s nem cache por hash da ADR-0012; so fallback try/catch

| Campo | Valor |
|---|---|
| Origem | #69 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / funcional / latente |
| Tipo / Lente | lacuna / L5 |
| Estágio | E10 |
| Componente | RAG reranker (kb_retrieval) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `reranker-sem-timeout-cache` · ADR: ADR-0012 |

**Evidência:** src/shared/lib/rag/reranker.ts:24-45 (generateObject sem AbortSignal/timeout; try/catch retorna slice; nenhum cache por hash)

Sob carga/latencia do modelo de rerank o kb_retrieval fica bloqueado ate o modelo responder (sem timeout) e re-paga o custo a cada chamada (sem cache). Contornado hoje pelo fallback que retorna os topN por similaridade em erro, mas nao cobre lentidao (nao-erro).

**Proposta:** Adicionar AbortSignal com timeout (~5s) no generateObject e cache por hash(query+candidatos) conforme ADR-0012.

## `a6-ia-08` · Semantic recall hardcoda Vertex 3072d e ignora o fallback OpenAI 1536d da ADR-0005

| Campo | Valor |
|---|---|
| Origem | #70 |
| Verificação (auditor) | plausivel (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | inconsistencia / L3 |
| Estágio | E10 |
| Componente | semantic recall (persist/query SQL) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `embedding-fallback-nao-cobre-recall` · ADR: ADR-0005 |

**Evidência:** src/shared/lib/memory/persist-sql.ts:33 e src/features/ai-agents/tools/recall-similar-sql.ts:23 (hardcode vertex.textEmbeddingModel('gemini-embedding-001'), 3072d) vs src/shared/lib/rag/embeddings.ts:10-24 (getModel respeita RAG_EMBEDDING_PROVIDER, fallback openai text-embedding-3-small 1536d)

Dentro do recall (persist e query) ambos hardcodam Vertex 3072d, entao NAO quebram entre si (a afirmacao literal da obs de 'quebrar o cosine query<->store' e refutada nesse escopo -> plausivel). O gap real: o recall ignora o contrato de fallback da ADR-0005; se o fallback OpenAI for ativado (RAG_EMBEDDING_PROVIDER=openai) o pipeline RAG (embedTexts) passa a 1536d enquanto o recall segue 3072d, e a colecao embeddingsDocs pode misturar dimensoes entre docs antigos/novos.

**Proposta:** Fazer persist-sql e recall-similar-sql usarem o getModel() central (embeddings.ts) para honrar o provider/dimensao configurados.

## `a6-ia-09` · Scrubber cobre so CPF/CNPJ/email (sem telefone BR/RG/IDs) e usa placeholders divergentes da ADR-0011

| Campo | Valor |
|---|---|
| Origem | #71 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / seguranca / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E10 |
| Componente | pii-scrubber (recall/RAG ingest) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `pii-scrubber-cobertura-parcial` · ADR: ADR-0011 |

**Evidência:** src/shared/lib/rag/pii-scrubber.ts:14-27 (regex so CPF/CNPJ/email; placeholders [CPF_REDACTED]/[CNPJ_REDACTED]/[EMAIL_REDACTED]) vs ADR-0011:104-106 (exige tambem telefone BR e IDs numericos suspeitos; placeholders {{CPF}}/{{CNPJ}}/{{EMAIL}}/{{ID}})

Identificadores primarios (CPF/CNPJ/email) SAO cobertos, mas telefone/RG/ID numerico em literais de SQL (WHERE telefone='...') seriam embedados crus em embeddingsSql - persistencia de PII (LGPD) ativa, porem superficie estreita (so drafts de SQL). Divergencia de placeholders e cosmetica. Rebaixado para media pela cobertura parcial + superficie limitada.

**Proposta:** Estender regex para telefone BR, RG e IDs numericos suspeitos em literais SQL; alinhar placeholders ao contrato (decidir formato canonico) e cobrir com fixtures adversariais.

## `a6-ia-10` · embeddingsDocs mistura dois shapes (rag-service sourcePath vs KB sourceDocId); queryDocs nao acha docs clientId:null

| Campo | Valor |
|---|---|
| Origem | #77 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **media** / config / latente |
| Tipo / Lente | inconsistencia / L3 |
| Estágio | E10 |
| Componente | embeddingsDocs (rag-service vs KB) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `embeddingsdocs-dois-schemas` · ADR: ADR-0016 |

**Evidência:** src/shared/lib/rag/rag-service.ts:47-80 (upsertDoc usa sourcePath) e :103-129 (queryDocs filtra clientId por igualdade estrita); src/features/ai-studio/kb/kb-upsert.ts:25-42 (usa knowledgeBaseId+sourceDocId+clientId nullable); src/features/ai-studio/kb/query-kb.ts:21-24 (resolveVisibleKbs trata clientId null) vs queryDocs sem OR NULL

Duas familias de doc coabitam a mesma colecao com campos divergentes. A obs de que docs clientId:null nunca sao recuperados vale para queryDocs (vector_query, igualdade estrita) — confirmado. Porem o caminho de KB (kb-retrieval-tool -> resolveVisibleKbs -> queryKbDocs por knowledgeBaseId) TRATA null corretamente, entao a KB global E recuperada por esse caminho — parcialmente refutando o alcance total da observacao.

**Proposta:** Separar colecoes ou unificar o shape; para KB global (clientId:null) usar o caminho kb (queryKbDocs por knowledgeBaseId) e/ou adicionar OR NULL em queryDocs.

## `a6-ia-11` · Flags do /api/chat sao no-op e o phase gating (ADR-0008) so roda no orchestrator legado sem caller

| Campo | Valor |
|---|---|
| Origem | #66 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | codigo-morto / L3 |
| Estágio | E10 (afeta: OPS) |
| Componente | /api/chat (flags), orchestrator legado |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `orchestrator-legado-sem-caller-flags-noop` · ADR: ADR-0008 |

**Evidência:** app/api/chat/route.ts:55-57 (useImprovedSupervisor/useVertexPromptCache 'sem efeito apos ADR-0014'); src/features/ai-agents/orchestrator.ts:38 (createOrchestrator exportado) sem caller nao-teste (grep de imports vazio); phase gating em orchestrator.ts:79-122

grep confirma que createOrchestrator (com prepareStep/PHASE gating e compact-messages-v2) nao tem consumidor de producao — /api/chat usa resolveChatAgent->buildSupervisorAgent (Mastra). Logo phase gating e V2-compaction estao inativos em producao, e as duas flags do body sao aceitas mas ignoradas.

**Proposta:** Remover as flags no-op do schema do /api/chat e marcar createOrchestrator/phase-gating como legado (ou reintegrar ao caminho Mastra), documentando o estado.

## `a6-ia-12` · Tabela fase->tools do codigo difere da ADR-0008 e so vive no caminho legado sem caller

| Campo | Valor |
|---|---|
| Origem | #68 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | phases/phase-to-tools |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `orchestrator-legado-sem-caller-flags-noop` · ADR: ADR-0008 |

**Evidência:** src/features/ai-agents/phases/phase-to-tools.ts:16-57 (PHASE_TOOL_MAP com os 8 sub-agentes + generate_pdf/generate_csv) vs ADR-0008 (lista comparative_agent/causal_agent/bqml.*)

O PHASE_TOOL_MAP real expoe os 8 sub-agentes reais + geradores de artefato, nao os agentes/tools citados na ADR. Alem de doc-drift, o mapa so e consumido pelo prepareStep do orchestrator legado (ver #66), sem caller de producao.

**Proposta:** Atualizar ADR-0008 para a tabela real (phase-to-tools.ts) ou registrar como superada; alinhar ao estado do orchestrator legado (#66).

## `a6-ia-13` · ADR-0014 menciona pgvector, superado pela ADR-0013; vetor nunca foi pgvector no codigo final

| Campo | Valor |
|---|---|
| Origem | #65 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | ADRs vs codigo |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `adr-doc-drift-pos-implementacao` · ADR: ADR-0014 |

**Evidência:** adrs/decisions/0014-mastra-runtime-full.md:71-72 ('vetor permanece pgvector (ADR-0004)') vs ADR-0013 (Firestore + cosine JS, superseda 0004); src/shared/lib/firestore/vector-search.ts

O vetor final e brute-force cosine sobre Firestore. Agrupa a familia adr-doc-drift-pos-implementacao junto de #67/#85/#87/#88.

**Proposta:** Anotar na ADR-0014 que o storage vetorial e Firestore/cosine (ADR-0013), nao pgvector.

## `a6-ia-14` · Caminhos de arquivo da ADR-0008 divergem do codigo (orchestrator/* vs phases/* + lib/*)

| Campo | Valor |
|---|---|
| Origem | #67 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | ADR-0008 caminhos de arquivo |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `adr-doc-drift-pos-implementacao` · ADR: ADR-0008 |

**Evidência:** adrs/decisions/0008...:203-210 aponta src/features/ai-agents/orchestrator/{phases,infer-phase,compact-messages,prompt-cache}.ts e phases.md; ls confirma que src/features/ai-agents/orchestrator/ NAO existe; arquivos reais em src/features/ai-agents/phases/* e lib/*

O diretorio orchestrator/ nao existe; os modulos estao em phases/ (phase-to-tools, infer-phase, prepare-step, types) e lib/ (compact-messages*).

**Proposta:** Corrigir os caminhos citados na ADR-0008 para phases/* e lib/*.

## `a6-ia-15` · decision-tree.md citado pela ADR-0007 nao existe (arvore esta em suggest-model.ts)

| Campo | Valor |
|---|---|
| Origem | #85 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | ADR-0007 decision-tree.md |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `adr-doc-drift-pos-implementacao` · ADR: ADR-0007 |

**Evidência:** adrs/decisions/0007...:245-246 cita src/features/ai-agents/tools/bqml/decision-tree.md; ls confirma ausencia; arvore em src/features/ai-agents/tools/bqml/suggest-model.ts

Arquivo inexistente confirmado por ls.

**Proposta:** Remover a referencia a decision-tree.md na ADR-0007 ou apontar para suggest-model.ts.

## `a6-ia-16` · ADR-0017 diz tools code-wired via buildToolsFactory, mas ja sao data-driven (toolRefs) e buildToolsFactory foi removido

| Campo | Valor |
|---|---|
| Origem | #87 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | ADR-0017 buildToolsFactory |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `adr-doc-drift-pos-implementacao` · ADR: ADR-0017 |

**Evidência:** adrs/decisions/0017...:35 ('tools permanecem code-wired via buildToolsFactory'); src/features/ai-agents/mastra/create-mastra-agent-from-config.ts:25 ('buildToolsFactory removido'); tools via toolRefs+tool-registry; grep buildToolsFactory so acha o comentario

O unico vestigio de buildToolsFactory e um comentario 'removido'; o wiring real e resolveAgentCapabilities->buildToolsFromKeys.

**Proposta:** Atualizar ADR-0017 para refletir tools data-driven via toolRefs + tool-registry (ADR-0016).

## `a6-ia-17` · ADR-0016 cita colecao knowledgeBaseDocs inexistente (codigo usa knowledgeBaseSources + embeddingsDocs)

| Campo | Valor |
|---|---|
| Origem | #88 |
| Verificação (auditor) | confirmado (diff-doc) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | ADR-0016 knowledgeBaseDocs |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `adr-doc-drift-pos-implementacao` · ADR: ADR-0016 |

**Evidência:** adrs/decisions/0016...:30 cita colecao knowledgeBaseDocs; codigo usa knowledgeBaseSources (src/features/ai-studio/kb/sources-repo.ts) + embeddingsDocs (kb-upsert.ts:6)

knowledgeBaseDocs nao existe no codigo; metadados de documentos ficam em knowledgeBaseSources e os chunks em embeddingsDocs.

**Proposta:** Corrigir a ADR-0016 para as colecoes reais (knowledgeBases, knowledgeBaseSources, embeddingsDocs).

## `a6-ia-18` · @mastra/memory nao substituiu o memory-service Firestore custom; ambos orquestradores ainda o usam

| Campo | Valor |
|---|---|
| Origem | #64 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | memory-service |
| DoD / Esforço | nenhum / G |
| Causa-raiz | `mastra-memory-nao-migrado` · ADR: ADR-0014 |

**Evidência:** grep '@mastra/memory' em src = 0 matches; app/api/chat/route.ts:37 e app/api/canvas-chat/route.ts:6 usam @/shared/lib/memory/memory-service (createThread); memory-service.ts (Firestore custom)

Convivencia temporaria admitida pela ADR-0014; nenhum import de @mastra/memory no src. Working memory + threads ainda via memory-service.ts (Firestore).

**Proposta:** Concluir migracao para @mastra/memory (ADR-0014) ou registrar a convivencia como decisao explicita/divida.

## `a6-ia-19` · Pin de templates na eviction usa templateId!=null, nao version='template' da ADR-0011

| Campo | Valor |
|---|---|
| Origem | #72 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | eviction (embeddingsBlocks) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `recall-lifecycle-adr0011-drift` · ADR: ADR-0011 |

**Evidência:** src/shared/lib/memory/eviction.ts:86-89 (pin por templateId != null) vs ADR-0011:79,88-91 (version='template'); nao existe campo version nos blocos

Funcionalmente pin funciona (templates com templateId nunca sao despejados); apenas o criterio difere do texto da ADR.

**Proposta:** Atualizar ADR-0011 para templateId (implementacao real) ou introduzir o campo version.

## `a6-ia-20` · bumpReuse dispara na recuperacao (candidatos retornados), nao no reuso efetivo

| Campo | Valor |
|---|---|
| Origem | #73 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / latente |
| Tipo / Lente | inconsistencia / L3 |
| Estágio | E10 |
| Componente | recall_similar_sql (bumpReuse) |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `recall-lifecycle-adr0011-drift` · ADR: ADR-0011 |

**Evidência:** src/features/ai-agents/tools/recall-similar-sql.ts:32-33 (bumpReuse quando matches.length>0, na recuperacao) vs ADR-0011:86-87 (last_used_at atualizado no reuso efetivo apos match do hash do SQL final)

Efeito: entradas meramente recuperadas (mesmo rejeitadas) tem lastReusedAt renovado e nunca expiram pelo TTL de 90d -> eviction menos eficaz e reuso inflado nas metricas.

**Proposta:** Mover o bump para quando o SQL recuperado e de fato reutilizado (hash do SQL final bate a entrada).

## `a6-ia-21` · Retorno do recall difere do contrato draft-as-hint da ADR-0011 (sem source/confidence/glossaryVersion)

| Campo | Valor |
|---|---|
| Origem | #74 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / doc / latente |
| Tipo / Lente | doc-drift / L3 |
| Estágio | E10 |
| Componente | recall_similar_sql (return shape) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `recall-lifecycle-adr0011-drift` · ADR: ADR-0011 |

**Evidência:** src/features/ai-agents/tools/recall-similar-sql.ts:43-55 (retorna {matches, tokensSaved}) vs ADR-0011:119-127 (contrato draft-as-hint com source/confidence/schemaSnapshot/glossaryVersion/last_used_at)

matches inclui score/schemaSnapshot mas nao os campos nomeados source/confidence/glossaryVersion; e retorna tokensSaved extra.

**Proposta:** Alinhar o shape (adicionar source/confidence/glossaryVersion) ou atualizar a ADR-0011 para o contrato real.

## `a6-ia-22` · Tool recall_similar_block esta definida/testada mas nao conectada a nenhum agente

| Campo | Valor |
|---|---|
| Origem | #75 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / latente |
| Tipo / Lente | codigo-morto / L3 |
| Estágio | E10 |
| Componente | canvas recall_similar_block |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `recall-similar-block-tool-morta` · ADR: ADR-0011 |

**Evidência:** src/features/canvas-orchestrator/tools/recall-similar-block.ts:11 (createRecallSimilarBlockTool) sem consumidor nao-teste (grep vazio); recall real inline em src/features/canvas-orchestrator/lib/fill-block-fn.ts:37-52 via queryBlockEmbeddings

A tool nao tem consumidor. Porem a 2a parte da observacao ('nenhum agente consome embeddingsBlocks') e REFUTADA: fill-block-fn.ts:44-49 consome embeddingsBlocks via queryBlockEmbeddings e persistBlockSpec o alimenta. Logo so a TOOL wrapper e morta, nao a colecao.

**Proposta:** Remover a tool orfa ou registra-la; manter o recall inline do fill-block-fn como caminho canonico.

## `a6-ia-23` · wrapToolReadOnly e codigo morto; protecao efetiva vem de outro mecanismo

| Campo | Valor |
|---|---|
| Origem | #76 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / latente |
| Tipo / Lente | codigo-morto / L3 |
| Estágio | E10 |
| Componente | memory readonly-guard |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `wraptoolreadonly-morto` · ADR: ADR-0011 |

**Evidência:** src/shared/lib/memory/readonly-guard.ts:33-41 (wrapToolReadOnly) sem consumidor nao-teste (grep so acha def + readonly-guard.test.ts); protecao real via createReadOnlyMemoryService (:20-27) + nao registrar updateWorkingMemory nos sub-agentes

A protecao read-only real e a injecao de ReadOnlyMemoryService + a nao-inclusao de updateWorkingMemory nas tools dos sub-agentes.

**Proposta:** Remover wrapToolReadOnly (ou wire se ainda desejado) e atualizar ADR-0011 que o cita.

## `a6-ia-24` · sqlCatalogEvents e write-only — escrito como telemetria, sem leitor no codigo

| Campo | Valor |
|---|---|
| Origem | #78 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / latente |
| Tipo / Lente | codigo-morto / L5 |
| Estágio | E10 (afeta: OPS) |
| Componente | sqlCatalogEvents |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `sqlcatalogevents-write-only` · ADR: ADR-0009 |

**Evidência:** src/features/ai-agents/tools/bq-list-validated-queries.ts:24 (write add em sqlCatalogEvents); grep sqlCatalogEvents = so os writes deste arquivo, nenhum leitor no codigo

Grep confirma nenhum reader; a colecao acumula eventos sem consumo.

**Proposta:** Adicionar consumidor (dashboard/agregacao) ou remover a escrita se sem uso.

## `a6-ia-25` · Logica de dry-run duplicada; bq-dry-run-sql nao delega apesar do comentario dizer que sim

| Campo | Valor |
|---|---|
| Origem | #80 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / latente |
| Tipo / Lente | inconsistencia / L3 |
| Estágio | E10 |
| Componente | bq-dry-run vs bq-dry-run-sql |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `dry-run-logica-duplicada` |

**Evidência:** src/features/ai-agents/tools/bq-dry-run.ts:1-4 (docstring 'bq.dry_run_sql delega para este helper') e :7-8,29-64; src/features/ai-agents/tools/bq-dry-run-sql.ts:6-7,41-77 (reimplementa regex+logica inline, NAO chama performDryRun)

READ_ONLY_RE/FORBIDDEN_RE e a classificacao de erro estao duplicadas nos dois arquivos; risco de divergencia futura das regras.

**Proposta:** Fazer createBqDryRunSqlTool delegar a performDryRun (fonte unica de regex/regras).

## `a6-ia-26` · Gate de drift por sigma nao implementado (descartado); rolling3mAvgDelta calculado mas nao usado no alerta

| Campo | Valor |
|---|---|
| Origem | #82 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / funcional / latente |
| Tipo / Lente | lacuna / L5 |
| Estágio | OPS (afeta: E10) |
| Componente | detect-drift |
| DoD / Esforço | nenhum / M |
| Causa-raiz | `drift-gate-sigma-nao-implementado` · ADR: ADR-0010 |

**Evidência:** src/features/evals/drift/detect-drift.ts:96-97 (thresholdSigma lido e 'void thresholdSigma'); :115 (alert = Math.abs(delta) >= thresholdAbs somente); :122-128 (rolling3mAvgDelta calculado mas nao usado no alerta)

Apenas o limiar absoluto +-0.1 decide alert; sigma e explicitamente descartado (void).

**Proposta:** Implementar o gate por z-score (sigma) ou remover thresholdSigma/rolling do contrato ate implementar.

## `a6-ia-27` · UI de qualidade exibe textos obsoletos (liquid_meta.eval_runs / stub BIGQUERY_PROJECT_ID); backend e Firestore

| Campo | Valor |
|---|---|
| Origem | #83 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / latente |
| Tipo / Lente | doc-drift / L5 |
| Estágio | OPS (afeta: E10) |
| Componente | admin-agent-quality (UI) |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `agentquality-textos-obsoletos` · ADR: ADR-0013 |

**Evidência:** src/pages/admin-agent-quality/ui/AgentQualityPage.tsx:64 ('liquid_meta.eval_runs') e :98 ('BIGQUERY_PROJECT_ID nao configurado'); backend real e Firestore (app/api/admin/eval-runs/route.ts:40 collection 'evalRuns', stub em falha de Firestore)

O stub agora vem de falha do Firestore, nao de BIGQUERY_PROJECT_ID ausente.

**Proposta:** Atualizar os textos da UI para Firestore (evalRuns) e a condicao real de stub.

## `a6-ia-28` · Categoria de tool 'export' declarada mas nao usada por nenhuma tool

| Campo | Valor |
|---|---|
| Origem | #89 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / latente |
| Tipo / Lente | codigo-morto / L3 |
| Estágio | E10 |
| Componente | tools-manifest |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `tool-category-export-morta` |

**Evidência:** src/features/ai-studio/tools-manifest.ts:2 (ToolCategory inclui 'export'); grep "category: 'export'" em src = 0; nenhum item do TOOL_MANIFEST usa 'export'

generate_pdf/generate_csv nem estao no manifest; a categoria fica sem uso.

**Proposta:** Remover 'export' do union ToolCategory ou classificar generate_pdf/generate_csv nela.

## `a6-ia-29` · Tool retrieve_business_context orfa — orquestradores chamam a funcao direto no build do prompt

| Campo | Valor |
|---|---|
| Origem | #90 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / cosmetico / latente |
| Tipo / Lente | codigo-morto / L3 |
| Estágio | E10 |
| Componente | retrieve_business_context tool |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `retrieve-business-context-tool-orfa` |

**Evidência:** src/features/ai-agents/tools/retrieve-business-context.ts:11 (createRetrieveBusinessContextTool) ausente de tools-manifest.ts, tool-registry.ts e default-agent-tools.ts (grep vazio); funcao retrieveBusinessContext chamada direto em src/features/ai-agents/orchestrator.ts:177-178 e canvas-orchestrator/orchestrator.ts:297-298

A tool nao esta no manifest/registry nem em nenhum agente; so o eval scorer referencia o NOME. A funcao subjacente e usada, so o wrapper-tool e morto.

**Proposta:** Remover a tool orfa; manter a injecao direta no prompt como caminho canonico.

## `a6-ia-30` · Tema de persona mapeado para persona inexistente (cfo-incorporadora), fora das 12 personas carregadas

| Campo | Valor |
|---|---|
| Origem | #92 |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | n/a (não exigido pelo §6.5) |
| Severidade / Dimensão / Estado | **baixa** / config / latente |
| Tipo / Lente | config-dados / L3 |
| Estágio | E10 |
| Componente | retrieve-persona-themes |
| DoD / Esforço | nenhum / P |
| Causa-raiz | `persona-theme-cfo-incorporadora-inexistente` |

**Evidência:** src/features/business-context/retrieve-persona-themes.ts:18 (chave 'cfo-incorporadora'); src/shared/config/business-context/personas/*.json tem 12 personas e NAO inclui cfo-incorporadora (existe cfo-securitizadora)

PERSONA_THEMES tem 13 chaves; cfo-incorporadora nao tem JSON de persona (ha template cfo-incorporadora-brz.json, mas nao a persona). Mapeamento inalcancavel por retrievePersonaThemes na pratica.

**Proposta:** Remover a chave cfo-incorporadora do PERSONA_THEMES ou criar a persona correspondente se pretendida.

## `a6-ia-31` · Nao existe gating de tools por cliente; capacidades sao globais por agente/skill

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E10 |
| Componente | AI Studio / runtime de tools |
| DoD / Esforço | DoD-2 / G |
| Causa-raiz | `gating-tools-por-cliente-ausente` · ADR: ADR-0016 |

**Evidência:** src/features/ai-studio/runtime/resolve-capabilities.ts:7-22 (capacidades so por agente/skill, sem clientId); src/features/ai-studio/runtime/tool-registry.ts:243-259 (buildToolsFromKeys sem filtro por tenant); aiAgents nao tem escopo de clientId; grep de gating por cliente em ai-studio = so tenancy server-bound de recall

O gating existente e (a) por agente/skill (toolRefs) e (b) por fase (phase-to-tools, so no orchestrator legado sem caller). Nenhum mecanismo restringe tools por clientId/tenant. DoD-2 item 3 ('gating de tools por cliente funciona e e observavel') nao esta atendido.

**Proposta:** Introduzir escopo por tenant nas tools (allowlist por cliente) e observabilidade do gating, conforme DoD-2 item 3.

## `a6-ia-32` · orchestrator-metrics retorna stub vazio permanente; telemetria de sub-agentes nao e agregada

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / funcional / ativo |
| Tipo / Lente | lacuna / L5 |
| Estágio | OPS (afeta: E10) |
| Componente | /api/admin/orchestrator-metrics |
| DoD / Esforço | DoD-2 / G |
| Causa-raiz | `orchestrator-metrics-stub-permanente` · ADR: ADR-0008 |

**Evidência:** app/api/admin/orchestrator-metrics/route.ts:55-62 (retorna sempre phases/subAgents/retryRate vazios, cacheHitRate:0, experimental:true); :47-53 (verifyAuthToken+isAdminEmail, nao aceita custom claim admin)

Spans sao emitidos so para stdout/Cloud Logging; o endpoint nunca agrega — o painel de analytics do orchestrator fica vazio. Relaciona-se a DoD-2 item 8 (telemetria/observabilidade). Nota menor: usa isAdminEmail (nao aceita role=admin via claim), divergindo de requireAdmin usado nas demais rotas admin.

**Proposta:** Persistir spans (recordSpan) numa camada consultavel e agregar aqui; alinhar auth com requireAdmin.

## `a6-ia-33` · Firecrawl/search_web chamavel por qualquer usuario autenticado, sem rate-limit nem escopo de custo

| Campo | Valor |
|---|---|
| Origem | novo |
| Verificação (auditor) | confirmado (leitura-estatica) |
| Pass adversarial | ⏳ pendente (limite de créditos) |
| Severidade / Dimensão / Estado | **media** / config / ativo |
| Tipo / Lente | lacuna / L2 |
| Estágio | E10 |
| Componente | /api/firecrawl, search_web tool |
| DoD / Esforço | DoD-2 / M |
| Causa-raiz | `firecrawl-sem-gate-admin-rate-limit` |

**Evidência:** app/api/firecrawl/route.ts:16-25 (so verifyIdToken — qualquer usuario autenticado, sem isAdminEmail nem rate-limit); src/features/ai-agents/tools/search-web.ts:11-27 (usa FIRECRAWL_API_KEY direto); src/shared/config/agents/default-agent-tools.ts:9 (search_web no external agent)

A rota /api/firecrawl so exige token Firebase valido (nao admin), e a tool search_web usa a API key diretamente sem throttle. Qualquer sessao de chat (via external agent) ou usuario logado pode gerar custo externo sem limite. Mapeia a DoD-2 item 8 (custo/rate-limit).

**Proposta:** Adicionar rate-limit/quota e (se aplicavel) restricao de quem pode chamar; instrumentar custo por tenant (DoD-2 item 8).
