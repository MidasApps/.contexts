# Plano: Injeção de Contexto de Negócio e Evals para Dashboard Builder

**Data**: 2026-05-04
**Escopo**: agentes em `src/shared/config/agents/` e `src/features/ai-agents/` (sql-agent, layout-agent, analyst-agent, descriptive-agent) que constroem dashboards a partir de briefings em linguagem natural.
**Stack LLM**: Vertex Gemini via `@ai-sdk/google-vertex` (`gemini-2.5-flash-lite|flash|pro` em `src/features/ai-agents/model-registry.ts`). Toda referência a Anthropic/Claude no plano deve ser lida como abstração — implementação real usa `getModel(...)`.

**Fontes lidas**: `docs/benchmarking/6.1` (personas), `docs/benchmarking/6.2` (ICPs), capítulos 1.6/3.x/4.x/5.x/7.x do mesmo corpus, `adrs/mastra/agents/agent.mdx`, `adrs/mastra/agents/getInstructions.mdx`, `adrs/mastra/evals/create-scorer.mdx`, `adrs/mastra/observability/`.

---

## 1. Diagnóstico

Os agentes recebem system prompt genérico e o briefing do usuário, sem camadas explícitas sobre **cliente** (OM/BRZ/CONX/IMCASA divergem em produto, schema, glossário e tolerância regulatória), **persona** (CEO de incorporadora pensa VSO/queima de caixa; Diretor de FII de CRI pensa razão PMT, P/VP, duration; Controller pensa PDD CMN 2.682 vs IFRS 9), **macro** (Selic atual via BCB SGS série 432; INCC série 188; IPCA série 433 — sempre lidos em runtime, sem valor fixo no plano) e **regulatório** (CVM 60, Lei 13.786, Res. CMN 4.676/4.909/5.255).

Falhas mensuráveis: (1) SQLs sem viés de negócio — agrega por mês quando persona pensa por safra; ignora distrato (Lei 13.786) ao calcular VSO; "inadimplência" sem distinguir Over 30/60/90 nem alinhar com CMN 2.682. (2) Layouts genéricos — KPI cards iguais para CEO (4-6 macro) e Controller (dezenas de buckets). (3) Análises sem contexto — não reconhece DY de ~11% como normal em KNCR11-like, ou que defaults de CRI dobraram em 2024 (58 abr-dez). Custo regulatório de alucinação é alto: gestores de FII e compliance descartam no primeiro erro factual.

---

## 2. Camadas de contexto a injetar (system + dynamic)

Cada agente compõe system prompt em runtime via `instructions: ({ requestContext }) => ...` (Mastra dynamic instructions, `agent.mdx`).

### 2.1 Cliente (request-context: `clientId`)

```yaml
client:
  id: OM | BRZ | CONX | IMCASA
  portfolio_profile: { dominant_product: SBPE|MCMV|CRI|CRA|LCI, avg_ltv, wal, oc_target }
  schema_hints: { tables_preferred, partition_key: data_competencia, granularity: contrato|safra|carteira }
  internal_glossary_overrides: [{ term, definition, source_table }]
  compliance_constraints: [CVM_60, CMN_4676, Lei_13786, RET]
```

### 2.2 Persona (request-context: `personaId`)

12 personas confirmadas em **6.1**: estratégicas (CEO incorporadora, CFO incorporadora/securitizadora, Diretor FII de CRI, Diretor crédito imobiliário banco), táticas (Gestor crédito-obra, Gestor repasse bancário, Controller, Gestor de carteira de securitizadora), operacionais (Analista de crédito, Analista de cobrança, Corretor, Backoffice cartorário). Bloco injetado define `language`, `horizon`, `priority_kpis`, `preferred_granularity`, `preferred_visuals`, `jargon_anchor`, `forbidden`.

### 2.3 ICP (request-context: `icpId`)

60+ entidades confirmadas em **6.2**: Incorporadoras (Grandes/Médias/Pequenas; MCMV vs MAP vs Alto/Luxo vs Loteamentos), Bancos (Caixa, Itaú, Bradesco, Santander, BB, BRB, Banrisul, Inter, Creditas, CashMe, Pontte), Fundos/gestoras (Kinea/KNCR11/KNIP11, RBR, Capitânia/CPTS11, Pátria/HGCR11, Iridium/IRDM11, FIDCs imobiliários, family offices), Securitizadoras (Opea, Virgo, Fortesec, Canal, Vert, Bari, HabitaSec), Suporte (Kzas/Creditas/CrediHome/Melhortaxa, trustees Vórtx/Oliveira Trust/Pentágono, ONR/cartórios, avaliadoras, Caixa Seguridade/Zurich Santander/Too).

### 2.4 Macro snapshot (versionado)

Fonte canônica única: **BCB SGS** — séries 432 (Selic meta), 188 (INCC-M), 433 (IPCA), mais TR e IGP-M. TTL 1h com fallback para snapshot diário persistido se SGS indisponível. **O plano não fixa números**: valores são lidos em runtime.

```yaml
macro_snapshot:
  as_of_date: <runtime>
  source: BCB_SGS
  series: { selic: <SGS 432>, ipca_12m: <SGS 433>, incc_12m: <SGS 188>, igpm_12m: <SGS 189>, tr_12m: <SGS 226> }
```

**Versionamento**: campo `as_of_date` + `source` propagados em todo retrieval para evitar inconsistência cross-agent (sql-agent não pode comparar com macro de timestamp diferente do analyst-agent na mesma sessão).

### 2.5 Regulatório (versionado)

Guardrails fixos por persona: Controller/Gestor de carteira → CMN 2.682 (buckets AA-H, provisões 0%/0,5%/1%/3%/10%/30%/50%/70%/100%) + IFRS 9 (3 estágios). Diretor FII/Securitizadora → CVM 60, regime fiduciário, limite 20% concentração, Res. CMN 5.118. CEO/CFO → Lei 13.786 (retenção 25%/50%), RET 4%/1%, CMN 5.255/2025 (DII, teto SFH R$ 2,25M). Campo `regulatory_pack_version` carimba qual snapshot foi usado.

---

## 3. Estratégia de retrieval contextual

Pipeline pré-geração: (1) resolver `clientId`+`personaId`+`icpId` do `RequestContext`; (2) carregar perfis estáticos (JSON em memória); (3) recuperar 3-5 chunks do vector store sobre `docs/benchmarking/` filtrados por `{cliente_produto, persona_tema, regulamento, clientId}`; (4) carregar `macro_snapshot` (cache 1h); (5) mesclar com working memory da sessão (briefing original, decisões anteriores) — **sem valores literais de filtros sensíveis** (ver §3.1).

**Prompt cache**: no stack atual (Vertex), prompt cache é via `google.cachedContent` (TTL configurável, mínimo ~32k tokens cacheáveis), com semântica diferente de `cacheControl: ephemeral` (Anthropic). Migrar conforme suporte do `@ai-sdk/google-vertex` instalado — tratar como **otimização Fase 3**, não bloqueante.

### 3.1 PII em prompt cache e RAG

Dashboards expõem CPF, contratos, dados de devedor. Regras: (a) PII scrubbing (regex CPF/CNPJ/RG/email) antes de embedar SQLs validados no corpus de exemplos; (b) working memory **não** armazena valores literais de filtros sensíveis — apenas IDs hash + tipo de filtro; (c) prompt cache (`google.cachedContent`) jamais inclui PII (cliente+persona+glossário+regulatório são seguros; macro é seguro; chunks RAG passam por scrubber antes de cachear).

### 3.2 Multi-tenancy hard isolation

Filtro obrigatório por `clientId` (OM/BRZ/CONX/IMCASA) em todo retrieval RAG e working memory. Vector store usa namespace por cliente; queries fora do namespace falham fechado. **Teste de vazamento cross-tenant é gate de Fase 2**: dataset adversarial com 20 queries tentando inferir dados de outro cliente; zero recall obrigatório.

---

## 4. Templates de dashboard por persona+cliente

Matriz inicial de **6 templates persona+cliente** (KPIs, visuais, tabelas):

| # | Persona | Cliente | KPIs | Visuais |
|---|---------|---------|------|---------|
| 1 | Diretor FII de CRI | OM | OC, Excess Spread, WAL, PDD, Over 90, Razão PMT/Saldo | Vintage curves, Transition matrix CMN 2.682, Waterfall DY |
| 2 | Gestor de carteira securitizadora | OM | Razão PMT/Saldo, Aging 30/60/90, Vintage, Evolução obra | Vintage por originador, Heatmap concentração devedor |
| 3 | CFO incorporadora | BRZ | Custo funding, PDD/PECLD, DSCR, Dívida líq/PL, Margem safra | Funding mix waterfall, Curva covenants, INCC vs cronograma |
| 4 | Compliance | IMCASA | Eligibility, Concentration, Covenant triggers, CVM 60 | Concentration heatmap, Trigger timeline |
| 5 | Diretor crédito banco | CONX | Originação, Over 90, Spread, Market share, Direcionamento | Originação vs meta, Roll rate por safra SBPE/MCMV |
| 6 | CEO incorporadora | BRZ | VSO, VGV, Queima de caixa, Margem, Pipeline repasse | Curva S vs orçamento, Backlog repasse, INCC sensibilidade |

JSON em `src/shared/config/dashboard-templates/`. Layout-agent usa como base, podendo desviar com justificativa. **Cardinalidade evals**: 180 briefings = **6 templates × 30 variações** na Fase 1-3; expandir para 360 (12 templates × 30) na Fase 3+ cobrindo as 12 personas restantes.

---

## 5. Glossário ativo + `lookup_glossary`

**Estado atual**: `TOOL_STATUS_MAP` em `src/features/ai-agents/create-agent-tool.ts:69` apenas mapeia nome→status — **não é a tool**. A tool real está duplicada inline em `src/features/ai-agents/agents/descriptive-agent.ts:67` e `src/features/canvas-orchestrator/lib/sub-agent.ts:214`. Glossário central em `src/shared/config/glossary.ts` tem ~20 termos.

**Pré-requisito explícito da Fase 1**: extrair `lookup_glossary` para `src/features/ai-agents/tools/lookup-glossary.ts` (fonte única); refatorar os dois call-sites para importar dela; expandir glossário central para cobrir LTV, DSCR, WAL, PDD, RET, OC, ES, CRI, CRA, LCI, MCMV, SBPE, CVM 60, CMN 2.682, distratos, PDD BACEN, INCC, IPCA, SINAPI, ICVM 175.

Retorno padronizado: `{ term, definition, formula, benchmark, regulamento[], source_doc, glossary_version }`. Campo `glossary_version` propagado em retrieval — mudança de definição (ex: "DSCR investment grade ≥ 1.3" virar "≥ 1.4") **invalida evals históricos**: re-rodar dataset.

---

## 6. Evals/scoring

`createScorer` de `@mastra/core/evals`. Cinco scorers próprios + 3 built-in.

### 6.1 Scorers próprios

1. **`sql_correctness`** (function): dry-run BigQuery, `bytes_processed` razoável, partition filter presente, sem `SELECT *`/CROSS JOIN.
2. **`layout_coherence`** (function + judge): KPIs antes de detalhes, 3-5 blocos, cobertura `priority_kpis` ≥80%, visuais em `preferred_visuals`.
3. **`persona_fit`** (LLM-as-judge): linguagem alinhada à persona, jargão correto, granularidade adequada (0-1).
4. **`business_correctness`** (LLM-as-judge com regulatório injetado): números coerentes, citações de norma corretas, sem alucinação.
5. **`citation_grounding`** (function): toda afirmação regulatória/numérica tem `source_doc` apontando para chunk RAG real.

### 6.2 Built-in: `faithfulness`, `prompt-alignment`, `tool-call-accuracy`.

### 6.3 Drift de LLM-as-judge

Judge atual `gemini-2.5-pro` (`getModel('reasoning')`) pode ser trocado. **Métrica de drift**: 30 itens "gold" (calibração humana) re-rodados mensalmente; comparar score do judge atual com baseline humano; threshold ±0.1 dispara recalibração (ajuste de rubrica) ou troca de judge. Versão do judge (`judge_model_version`) carimbada em todo run de eval.

### 6.4 Custo de evals em CI

180 itens × 8 scorers × judge LLM ≈ **5.400 chamadas/noite**. Estimar com `experimental_telemetry`: assumindo ~3k tokens in / 800 out por chamada e tarifa Vertex `gemini-2.5-pro`, custo de ordem dezenas de USD/noite. **Se inviável diário, mover para semanal** (segunda à noite) + smoke suite de 30 itens nightly em PRs que tocam `agents/`.

### 6.5 Observabilidade runtime

`Mastra.scorers` registra os 5 scorers para trace scoring. Spans OTel via `experimental_telemetry`. Dashboard `/admin/agent-quality` com p50/p95 por scorer, persona, cliente.

---

## 7. Plano de adoção em fases

**Fase 1 — Dynamic system prompt + glossário consolidado (≤2 sem)**
- Extrair `lookup_glossary` para arquivo único; deduplicar call-sites; expandir glossário central (~50 termos).
- Refatorar `agents/*` para `instructions: ({ requestContext }) => ...`.
- Perfis estáticos JSON (4 clientes × 12 personas × ICPs) em `src/shared/config/business-context/`.
- `useMacroSnapshot` (BCB SGS séries 432/188/433 + cache 1h + fallback).

**Fase 2 — RAG sobre benchmarking (≤2 sem)**
- Ingestão dos docs de `docs/benchmarking/` em vector store (Vertex Vector Search ou pgvector), namespace por cliente.
- Tool `retrieve_business_context(query, filters)`.
- **Gate**: teste de vazamento cross-tenant (zero recall).

**Fase 3 — Scorers + dataset + dashboard (≤2 sem)**
- 5 scorers próprios + built-ins; 30 itens "gold" para calibração de judge.
- 180 briefings (6 templates × 30) curados por SMEs.
- CI nightly smoke (30) + weekly full (180); `/admin/agent-quality`.
- Otimização: avaliar `google.cachedContent` para blocos estáveis.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Alucinação regulatória | `citation_grounding` + `outputProcessor` rejeita resposta sem `source_doc` em afirmação regulatória. |
| RAG recall baixo cross-tema | Embedding multilingue + rerank cross-encoder; metadata-filter; query rewriting. |
| Persona ausente | `requestContextSchema` valida obrigatoriedade; fallback "analista genérico" com aviso. |
| Macro defasado em inflexão | TTL 1h + revalidação background; flag `data_freshness` visível no dashboard. |
| Vazamento cross-tenant | Namespace por `clientId`; teste adversarial como gate Fase 2. |
| PII em cache/RAG | Scrubber regex antes de cachear/embedar; working memory só com IDs hash. |
| Drift regulatório (nova CMN) | `regulatory_pack_version`; alerta em commit de `docs/benchmarking/`; re-rodar evals. |
| Drift de glossário | `glossary_version` invalida evals históricos; gate de re-execução. |
| Drift de LLM-as-judge | 30 itens "gold" mensais; threshold ±0.1 vs baseline humano. |
| Custo de evals | Smoke nightly (30) + full weekly (180) se 5.400 chamadas/noite inviável. |

---

## Anexo: snippet de referência (Mastra dynamic instructions, Vertex Gemini)

```typescript
import { getModel } from '@/features/ai-agents/model-registry'

export const sqlAgent = new Agent({
  id: 'sql-agent', name: 'SQL Agent',
  instructions: async ({ requestContext }) => {
    const { clientId, personaId, briefing } = requestContext.get('businessCtx')
    const [client, persona, macro, ragChunks] = await Promise.all([
      loadClientProfile(clientId), loadPersonaProfile(personaId),
      getMacroSnapshot(), retrieveBenchmarkingChunks(briefing, { clientId, personaId, k: 5 }),
    ])
    return composeSystemMessages({ client, persona, macro, ragChunks })
  },
  model: getModel('reasoning'), // vertex('gemini-2.5-pro')
  scorers: { sql_correctness, persona_fit, business_correctness, citation_grounding },
})
```
