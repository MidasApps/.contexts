# Backlog de Remediação Priorizado — "Terminar o Produto"

- **Data:** 2026-07-21
- **Fonte:** `docs/auditoria/2026-07-21-registro-achados.md` (106 achados verificados; detalhe completo por `id`)
- **Metodologia:** `docs/superpowers/specs/2026-07-21-revisao-remediacao-design.md`
- **Status da auditoria:** ⚠️ **PARCIAL** — 5/7 estágios auditados. Pendentes: E9 Frontend (13 hipóteses #50–#62 do Apêndice A), raia OPS (incl. `/api/benchmark`), e pass adversarial de 25 achados (limite de créditos da org atingido durante o run; o workflow pode ser retomado com cache — só o que falta re-executa).

Legenda: **Sev** alta/média/baixa · **Esf** P/M/G · **Adv** ✓ = pass adversarial concluído (veredito confirmado), ⏳ = pendente, – = não exigido.

---

## Revisão de completude (pós-consolidação, 2026-07-21)

Uma revisão do próprio backlog encontrou e corrigiu 3 classes de lacuna:

1. **6 achados médio/alto ficaram fora da 1ª versão do backlog e foram realocados abaixo** — em especial `a2-metricas-02` (**alta, DoD-1**: falha de métrica vira bloco vazio silencioso), além de `a1-dados-03`, `a2-metricas-06`, `a2-metricas-09`, e o cluster derived-join / enabledIndicators.
2. **Duplicatas cross-auditor** (a consolidação por causa-raiz do §6.7 rodou *dentro* de cada auditor, não *entre* eles — a etapa cross foi cortada pelo limite de créditos). Pares que são a MESMA causa: `a1-dados-06 ≡ a2-metricas-07` (JOIN derived sem alias, `resolve-metric.ts:562`); `a1-dados-08 ≡ a2-metricas-06` (coverage pre-check pula sql/derived, `execute-metric.ts:240`); `a2-metricas-11 ≡ a4-cliente-permissoes-06` (enabledIndicators não gateia execução); `a1-dados-07 ≡ a2-metricas-16` (literal `bq-data-wh.liquid_aux` nas recipes). Portanto **causas-raiz distintas ≈ 102**, não 106.
3. **Itens de DoD que a auditoria ainda NÃO resolveu** (viram pendência explícita, ver seção final): **print-token** (DoD-1 #8 — `?_pt=`/`export-pdf/verify`) não tem finding dedicado porque o auditor E9 não rodou; **prompt-injection via KB, versionamento de agente e cost/rate-limit** (DoD-2 #8) só têm cobertura parcial (`a6-ia-33` toca custo do firecrawl; `a6-ia-32` toca telemetria; versionamento e prompt-injection ficaram sem veredito).

---

## Caminho crítico DoD-1 (ordem de destravamento)

O produto do cliente externo (Vila Rosa) vive inteiro em `/g`. Hoje um usuário não-admin **não abre nenhum report, e mesmo que abrisse, os filtros de página falham**. Sequência mínima que destrava o ponta-a-ponta:

| # | ID | Adv | Esf | O que destrava |
|---|---|---|---|---|
| 1 | `a4-cliente-permissoes-01` | ✓ | P | `/g` e `/explore` concedíveis pela Admin UI (`ALL_ROUTES` + grupo `IA` no `RouteCheckboxGrid`) — sem isso, nenhum acesso é concedível |
| 2 | `a4-cliente-permissoes-02` | ✓ | M | Server (`/g` exato) e client (pathname completo) passam a comparar a mesma string de rota — sem isso, a concessão do item 1 ainda não abre a página |
| 3 | `a2-metricas-01` | ⏳ | P | `filter-values` roteia dataset por `contractRef==entidade` → dropdowns de filtro dos reports `/g` do Vila Rosa retornam 422. Corrigir o roteamento — sem isso, o report abre mas os filtros não funcionam |
| 4 | `a3-templates-01` | ⏳ | P | `productRefs: ['play']` órfão → clientes com `productBindings` não veem os 10 templates Play na galeria (migrar refs p/ `liquid-play` ou alias) |
| 5 | `a4-cliente-permissoes-12` | ✓ | G | Fluxo de provisionamento de credencial + `clientAccess` (hoje: console Firebase + script manual; zero `createUser` no repo) |

**Segurança que deve acompanhar o release externo (independentes entre si):**

| ID | Adv | Sev | Resumo |
|---|---|---|---|
| `a4-cliente-permissoes-11` | ✓ | alta | Regras Firestore deixam `clients/{id}/groups` e `/reports` com **write para qualquer autenticado** (IDOR cross-tenant) |
| `a3-templates-12` | ⏳ | alta | Qualquer usuário autenticado pode **criar/editar/apagar templates globais** (rota sem `requireAdmin`) |
| `a4-cliente-permissoes-03` | ✓ | alta | Embedded mode concede admin incondicional **e o handler `postMessage` não valida `origin`** |
| `a3-templates-21` | ⏳ | média | Escrita de reports/groups sem papel de editor (qualquer `clientAccess` do tenant edita/apaga) |
| `a2-metricas-17` | ⏳ | média | `filter-values` sem gate de rota/dataset (paridade G1 incompleta) |
| `a1-dados-19` | ⏳ | média | Config global (projectIds GCP, contracts, relations) legível por qualquer autenticado |

---

## WS-1 · Permissões & multi-tenancy → DoD-1

**Aceite:** usuário não-admin com `clientAccess=[vila-rosa]` e `/g` concedido carrega `/g/{groupId}/r/{reportId}` com todas as `covenants.*` em 200 (client E server); nenhuma escrita cross-tenant possível via API ou Firestore rules.

| ID | Sev | Esf | Adv | Resumo |
|---|---|---|---|---|
| `a4-cliente-permissoes-01` | alta | P | ✓ | P0 — `/g`/`/explore` não concedíveis (Admin UI) |
| `a4-cliente-permissoes-02` | alta | M | ✓ | P0 — mismatch de granularidade do route-match server×client |
| `a4-cliente-permissoes-11` | alta | M | ✓ | Firestore rules: write aberta em subcoleções de cliente (IDOR) |
| `a4-cliente-permissoes-03` | alta | M | ✓ | Embedded: admin incondicional + `postMessage` sem checagem de `origin` |
| `a3-templates-12` | alta | P | ⏳ | Escrita de templates globais sem `requireAdmin` |
| `a3-templates-21` | média | M | ⏳ | Reports/groups sem papel de editor |
| `a2-metricas-17` | média | P | ⏳ | `filter-values` sem gate de rota/dataset |
| `a1-dados-19` | média | P | ⏳ | Config global legível por qualquer autenticado |
| `a4-cliente-permissoes-04` | média | P | ✓ | Bypass de dev `NODE_ENV` (latente; contido por construção — hardening) |
| `a2-metricas-11` ≡ `a4-cliente-permissoes-06` | média | P | ⏳ | `enabledIndicators` só gateia surfacing da IA; execução via `/api/metrics` ignora a lista (gate que não gateia — decidir: aplicar no `executeMetric` ou documentar como só-surfacing) |

## WS-2 · CRUD & consistência de onboarding → DoD-1

**Aceite:** cliente criado pela Admin UI ≡ doc do seed (campos + `createdAt` preservado); usuário novo provisionável sem console Firebase; nenhuma escrita aceita refs inválidas.

| ID | Sev | Esf | Adv | Resumo |
|---|---|---|---|---|
| `a2-metricas-01` | alta | P | ⏳ | P0 — `filter-values` roteia por `contractRef==entidade` (422 nos dropdowns `/g`) |
| `a4-cliente-permissoes-12` | alta | G | ✓ | Provisionamento de credencial/claims ausente no app |
| `a4-cliente-permissoes-05` | média | M | – | Formato legado vs novo: UI só produz novo; 4 clientes legados não round-trip |
| `a1-dados-14` + `a3-templates-15` + `a4-cliente-permissoes-13` | média | P | – | Causa-raiz única: `merge:false` apaga `createdAt` (contracts, entities, attributes, metrics, products, seed `--force`) |
| `a4-cliente-permissoes-14` | baixa | P | – | `POST /api/users`/`groups` sem zod; `routeOverrides` aceita string arbitrária |
| `a1-dados-16` | média | P | – | Relations aceita refs inexistentes (sem validação referencial) |
| `a1-dados-17` | média | P | – | Delete de entity/attribute sem guard de métricas dependentes |
| `a1-dados-18` | média | M | – | Relations sem superfície na Admin UI (gestão só via seed) |
| `a3-templates-13` | média | M | – | Escrita de reports/groups sem validação de shape (blockMap/layout crus) |
| `a4-cliente-permissoes-07` | média | P | – | `contractRef` errado → 422 silencioso (roteamento por `requires[0]`) |
| `a1-dados-15` | média | P | – | Cache de cliente BigQuery por DataSource sem invalidação |
| `a1-dados-08` ≡ `a2-metricas-06` | média | M | – | Coverage pre-check (`missing[]`) pulado p/ recipes `sql`/`derived` → 422 genérico por coluna, sem lacuna agregada (a maioria do catálogo covenants é `sql`) |

## WS-3 · Templates & galeria → DoD-1 (uso)

**Aceite:** vila-rosa vê na galeria só templates dos produtos assinados; zero templates órfãos `['play']`; nenhum bloco renderiza valor bruto errado.

| ID | Sev | Esf | Adv | Resumo |
|---|---|---|---|---|
| `a3-templates-01` | alta | P | ⏳ | P0 — `productRefs ['play']` órfão (10 templates invisíveis) |
| `a3-templates-18` | baixa | P | – | Drafts aparecem na galeria de importação |
| `a3-templates-19` | baixa | P | – | Fail-open: cliente só com produtos archived vê TODOS os templates |
| `a3-templates-09` | média | G | – | Mudança de template não propaga a reports instanciados |
| `a3-templates-10` | média | M | – | `flattenKpiBlocks` regrupa ignorando `colSpan` e persiste layout mutilado |
| `a3-templates-14` | média | P | – | KPI de métrica DATE exibe `[object Object]` |
| `a3-templates-20` | baixa | P | – | Duplicar report copia `templateId` (drill-through ambíguo) |
| `a2-metricas-03` | média | M | – | Rename de métrica não re-aponta `blockMap.metricId` (blocos 404) |
| `a2-metricas-02` | **alta** | M | ⏳ | **DoD-1 #9 (estados de erro):** falha de métrica vira bloco vazio silencioso — `batch` mascara o erro (ok) mas `ReportPage`/`RouteTemplatePage` descartam o `error` do hook; reusar `BlockError` do explore |

## WS-4 · Camada de IA → DoD-2

**Aceite:** qualquer `model` do enum salva e resolve para tier runtime válido; chat renderiza sem chunk cru; approve exige `clientId`; evals/drift persistem e os painéis mostram dados.

| ID | Sev | Esf | Adv | Resumo |
|---|---|---|---|---|
| `a6-ia-01` | alta | P | ⏳ | `ModelTier` schema (`slow`) × runtime (`flash`) — save quebra ou tier órfão |
| `a6-ia-02` | alta | M | ⏳ | Supervisor multi-agente é o caminho ativo do `/api/chat` e o framing de sub-agente quebra o stream |
| `a6-ia-03` | média | P | ⏳ | Approve do sql-catalog: guard de tenant é opt-in (tornar `clientId` obrigatório — DoD-2 #4) |
| `a6-ia-05` | média | M | ⏳ | CLIs de evals/drift nunca persistem (`dryRun`/`persist:false` fixos) — painéis leem coleções vazias |
| `a6-ia-31` | média | G | ⏳ | Gating de tools por cliente não existe (capacidades globais por agente) |
| `a6-ia-32` | média | G | ⏳ | `orchestrator-metrics` é stub permanente (telemetria de sub-agentes não agregada) |
| `a6-ia-33` | média | M | ⏳ | Firecrawl/`search_web` sem gate admin/rate-limit/escopo de custo |
| `a6-ia-04` | média | M | – | 3 allowlists de clientId divergentes; BQML omite vila-rosa e **crasha em runtime** |
| `a6-ia-09` | média | M | ⏳ | Scrubber de PII parcial (sem telefone/RG; placeholders ≠ ADR-0011) |
| `a6-ia-06`/`07`/`08`/`10` | média | M | – | BQML cost-gate fixo; reranker sem timeout/cache (ADR-0012); embedding fallback; `embeddingsDocs` com 2 shapes |

## WS-0 · Dados & compliance (gate de release)

**Aceite:** nenhum threshold "A CONFIRMAR" em produção; nenhum semáforo com semântica inventada; escala percent consistente entre blocos.

| ID | Sev | Esf | Adv | Resumo |
|---|---|---|---|---|
| `a3-templates-04` | alta | P | ⏳ | Thresholds de covenant em produção são placeholders "A CONFIRMAR" (contrato Inter) |
| `a3-templates-05` | alta | P | ⏳ | `RATING_STATUS_MAP` A-H é convenção inventada (semáforo sem semântica de domínio) |
| `a3-templates-03` | média | M | ⏳ | Gauge não multiplica percent ×100 (KPI/table multiplicam) — escala inconsistente |
| `a2-metricas-04`/`05`/`10`/`15` | média | P–M | ⏳ | Formatação/escala/tokens de filtro silenciosamente divergentes (correção-de-dado latente) |
| `a1-dados-10`/`11`/`12` | média | P–M | ⏳ | Relation sem CAST expressável; tipo contract×físico não validado; `requires` multi-contract roteia silencioso |
| `a1-dados-03` | média | M | – | Dois `resolveColumn` divergentes: semântico fail-loud vs legado que devolve o nome em qualquer ausência (consumido por `/api/filter-options` e `/api/benchmark`) |
| `a2-metricas-09` | média | M | ⏳ | Duas semânticas de snapshot: covenants pina MAX (ignora o seletor de período) vs base usa `{filter.snapshot}` — mesmo input, resultados diferentes; tornar a data pinada observável ou migrar |

## WS-5 · Hardening, doc-drift & higiene (baixa)

41 achados de severidade baixa — clusters principais (ids no registro):

- **Doc-drift de ADR/CLAUDE.md:** `a1-dados-01`, `a4-cliente-permissoes-10` (fluxo `/api/bigquery` fantasma — inclusive o agent `credit-risk-analyst.md` instrui usá-lo); `a1-dados-02` (ADR-0015 Proposed há 2+ meses sendo o canon); `a6-ia-13`…`17`, `a6-ia-19`/`21` (ADRs 0005/0007/0008/0011/0014/0016/0017 divergem do código).
- **Código morto:** `a1-dados-05`, `a3-templates-11`/`16`, `a6-ia-22`/`23`/`24`/`28`/`29`.
- **Cosméticos de tema/galeria:** `a3-templates-06`/`07`/`08` (breakdown, label waterfall, rgba branco no tema claro), `a6-ia-25`/`27`/`30`.
- **Consistência menor:** `a1-dados-13`, `a4-cliente-permissoes-09` (dois conceitos "grupo"), `a2-metricas-08`/`13`/`14`, `a6-ia-11`/`12`/`18`/`20`/`26`.

## Dívida técnica anotada (não bloqueia esta release)

| ID | Sev | Esf | Resumo |
|---|---|---|---|
| `a1-dados-06` ≡ `a2-metricas-07` | média | M | `resolveDerivedMetric` monta `JOIN ON col=col` sem qualificar tabela/alias (`resolve-metric.ts:562`) → colunas homônimas quebram (`Column name id_contrato is ambiguous`). Contornado no Vila Rosa via `kind:'sql'` com alias manual, então **não bloqueia**; mas inviabiliza métricas `derived` cross-contract futuras. Gerar aliases determinísticos por entidade no resolver. |
| `dq-2026-09-26-01` | alta | M | **Covenants (Vila Rosa) não separam empreendimento.** Os dados têm 3 projetos (Viva Park, Jardim das Palmeiras, Residencial Aurora; gerador sintético em `scripts/lib/synthetic-portfolio.ts`) e as 13 páginas não têm seletor de projeto (`ambientFilters` sempre `[]`, `useReportData.ts`). **Decisão de 2026-09-26 (andrelmm): manter a visão consolidada por enquanto e rediscutir depois.** ⚠️ A visão atual NÃO é consolidada de fato: blocos com `ANY_VALUE`/`LIMIT 1` mostram UM projeto, e não sempre o mesmo (total de unidades 112 e plano de R$ 14 mi são do Viva Park; dívida de R$ 17,3 mi e realizado de obra 85,84% são do Jardim); o estoque soma os 3 (216); os índices recebível (0,35x) e pós-chaves+estoque (3,15x) são MÉDIAS de índices; a série de obra usa `MAX` entre projetos. Única exceção já corrigida: o medidor de dívida (`plano_empresario_uso_pct`, razão de somas, #60). Opções para a rediscussão: (A) seletor de empreendimento obrigatório; (B) consolidar de verdade (somas, e razão das somas nos índices); (C) um empreendimento por cliente. Evidência: teste de corretude de dados de 2026-09-26. |

## WS-Testes e WS-Onboarding (gates)

- **WS-Testes:** estabilizar baseline de flakiness (~6 falhas conhecidas, Mastra/chat); transformar a **lista de regressão** do spec §3 em testes: fail-closed server-side, isolamento KB por tenant, bypass dev off em prod, reset de senha.
- **WS-Onboarding:** runbook ponta-a-ponta (hoje o conhecimento vive nos seeds); teste round-trip seed ↔ Admin UI; depende de WS-2.

---

## Ordem de execução recomendada

```
WS-1 (P0: itens 1-2 do caminho crítico + segurança IDOR/templates/embedded)
  → WS-2 (a2-metricas-01 pode ir junto do P0; provisionamento em paralelo)
     → WS-3 ‖ WS-4 (independentes entre si)
        → WS-0 (gate de dados — bloqueia release, não desenvolvimento)
        → WS-Testes ‖ WS-Onboarding
           → WS-5 (higiene, contínuo/último)
```

## Pendências da auditoria (completar quando houver créditos)

1. **E9 Frontend** (hipóteses #50–#62): inclui (a) a resolução definitiva da Questão Aberta 1 (`/api/filter-options` nas páginas padrão) — nota: `a1-dados-04` já confirmou a rota como caminho pré-semântica; e (b) **print-token (DoD-1 #8)** — `?_pt=`/`export-pdf/verify`/`AuthProvider.tsx:69-87`: **nenhum finding dedicado existe ainda**; falta avaliar escopo/assinatura/expiração do token e a validação de `origin` no `postMessage` (relacionado a `a4-cliente-permissoes-03`).
2. **Raia OPS**: `/api/benchmark` (granularidade do agregado anonimizado — `a1-dados-20` já achou que ele **ignora clientes em formato novo**, silenciosamente), rotas `admin/*` (todas exigem `requireAdmin`?), crons (idempotência, credencial), telemetria (PII em spans/logs?).
3. **DoD-2 #8 sem veredito completo**: **prompt-injection via KB** (`kb-retrieval-tool.ts:26-33` injeta conteúdo de doc no prompt — sem finding dedicado) e **versionamento/ativação de agente** ficaram sem cobertura; custo/rate-limit e telemetria têm cobertura só parcial (`a6-ia-33`, `a6-ia-32`). Decidir por item: critério de release vs fora-de-escopo.
4. **25 passes adversariais** (marcados ⏳): até rodarem, esses vereditos são de 1 passada do auditor de estágio.
5. **Consolidação cross-auditor** (§6.7): dedup por causa-raiz *entre* auditores não rodou — ver os 4 pares na "Revisão de completude" acima; refazer ao retomar.
6. O workflow retoma do cache: só o que falta re-executa (auditores concluídos não re-rodam).
