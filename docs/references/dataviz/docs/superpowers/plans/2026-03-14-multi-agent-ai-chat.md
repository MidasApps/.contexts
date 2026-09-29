# Multi-Agent AI Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-model chat with a multi-agent orchestrator that routes to 7 specialized sub-agents, each with their own model, tools, and context.

**Architecture:** Orchestrator (`streamText` + Flash-Lite) routes questions to sub-agent tools. Each sub-agent is a `tool()` with async generator that yields preliminary results for progressive UX, then runs `generateText` with its own model/tools/prompt. Context passed via closure scope.

**Tech Stack:** Vercel AI SDK v6, @ai-sdk/google-vertex (Gemini 2.5 family), @google-cloud/bigquery, jsPDF + jspdf-autotable, Firecrawl, Firebase Admin

**Spec:** `docs/superpowers/specs/2026-03-14-multi-agent-ai-chat-design.md`

---

## Chunk 1: Foundation — Types, Model Registry, Agent Config Structure

### Task 1: Install new dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jspdf-autotable**

```bash
pnpm add jspdf-autotable
```

- [ ] **Step 2: Verify installation**

```bash
pnpm ls jspdf-autotable
```
Expected: Shows jspdf-autotable version.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add jspdf-autotable dependency for server-side PDF export"
```

### Task 2: Create types and agent config interfaces

**Files:**
- Create: `src/shared/config/agents/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/shared/config/agents/types.ts
import type { LanguageModelV1 } from 'ai';
import type { z } from 'zod';

export type AgentId =
  | 'sql_agent'
  | 'business_agent'
  | 'dashboard_agent'
  | 'comparison_agent'
  | 'external_agent'
  | 'export_agent'
  | 'simulation_agent';

export type ModelTier = 'router' | 'fast' | 'reasoning';

export interface AgentConfig {
  id: AgentId;
  description: string;
  model: ModelTier;
  maxSteps: number;
  inputSchema: z.ZodType;
  buildSystemPrompt: (context: AgentDynamicContext) => string;
  tools: Record<string, any>; // AI SDK tool definitions, created at request time
}

export interface AgentDynamicContext {
  dataset: string;
  filters: ChatRequestFilters;
  dashboardState: string; // buildAIContext() output
  page: string;
}

export interface ChatRequestFilters {
  dateRange: { start: string; end: string };
  projetos: string[];
  advancedFilters: {
    ratings: string[];
    elegibilidade: string[];
    faixaLtv: string[];
    faixaAtraso: string[];
    tipoProponente: string[];
    gruposRepasse: string[];
  };
  compareEnabled: boolean;
  comparePeriod?: { start: string; end: string };
}

export type PreliminaryStatus =
  | 'routing'
  | 'analyzing'
  | 'generating_sql'
  | 'executing_sql'
  | 'query_complete'
  | 'searching'
  | 'comparing'
  | 'simulating'
  | 'exporting'
  | 'done'
  | 'error';

export interface PreliminaryResult {
  status: PreliminaryStatus;
  agent?: AgentId;
  message?: string;
  data?: unknown;
  sql?: string;
  rowCount?: number;
  elapsedMs?: number;
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit src/shared/config/agents/types.ts 2>&1 | head -5
```
Expected: No errors (or only unrelated project errors).

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/types.ts
git commit -m "feat: add agent types and interfaces for multi-agent architecture"
```

### Task 3: Create model registry

**Files:**
- Create: `src/features/ai-agents/model-registry.ts`

- [ ] **Step 1: Create model registry**

```typescript
// src/features/ai-agents/model-registry.ts
import { customProvider } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import type { ModelTier } from '@/shared/config/agents/types';

export const models = customProvider({
  languageModels: {
    router: vertex('gemini-2.5-flash-lite'),
    fast: vertex('gemini-2.5-flash'),
    reasoning: vertex('gemini-2.5-pro'),
  },
});

// Helper for type-safe model access
export function getModel(tier: ModelTier) {
  return models(tier);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-agents/model-registry.ts
git commit -m "feat: add model registry with customProvider and Gemini aliases"
```

### Task 4: Create agent context config files

**Files:**
- Create: `src/shared/config/agents/orchestrator.ts`
- Create: `src/shared/config/agents/sql-agent.ts`
- Create: `src/shared/config/agents/business-agent.ts`
- Create: `src/shared/config/agents/dashboard-agent.ts`
- Create: `src/shared/config/agents/comparison-agent.ts`
- Create: `src/shared/config/agents/external-agent.ts`
- Create: `src/shared/config/agents/export-agent.ts`
- Create: `src/shared/config/agents/simulation-agent.ts`
- Create: `src/shared/config/agents/index.ts`

- [ ] **Step 1: Create orchestrator prompt**

```typescript
// src/shared/config/agents/orchestrator.ts
export const ORCHESTRATOR_SYSTEM_PROMPT = `Voce e o orquestrador do Assistente AI da Liquid DataViz. Sua unica funcao e analisar a pergunta do usuario e chamar o agente especialista correto.

## Agentes disponiveis

- **sql_agent**: Consultas de dados especificos no BigQuery. Use quando o usuario pede dados brutos, listas de contratos, filtros especificos, ou qualquer informacao que exija query SQL. Ex: "Quais contratos tem mais de 90 dias de atraso?", "Liste os 10 maiores saldos devedores".

- **business_agent**: Explicacoes de conceitos, regras de negocio, formulas e termos de securitizacao. Use quando o usuario pede definicoes ou quer entender como algo funciona. Ex: "O que e PDD Liquid?", "Como funciona o rating?".

- **dashboard_agent**: Resumo e interpretacao do que o usuario esta vendo no dashboard agora. Use quando a pergunta se refere aos dados visiveis, KPIs atuais ou estado dos filtros. Ex: "Resuma os KPIs atuais", "O que esses numeros significam?".

- **comparison_agent**: Analise de tendencias, variacoes entre periodos, deteccao de anomalias. Use quando o usuario quer comparar, ver evolucao temporal ou entender mudancas. Ex: "Como a inadimplencia evoluiu?", "Compare este mes com o anterior".

- **external_agent**: Dados economicos externos (Selic, IPCA, IGPM, mercado imobiliario). Use quando a pergunta envolve indicadores macroeconomicos. Ex: "Qual a Selic atual?", "Como esta o IPCA?".

- **export_agent**: Geracao de relatorios PDF ou CSV para download. Use quando o usuario pede para exportar, gerar relatorio ou baixar dados. Ex: "Gere um PDF da carteira", "Exporte os contratos em CSV".

- **simulation_agent**: Cenarios hipoteticos e what-if. Use quando o usuario quer simular mudancas e ver o impacto. Ex: "Se o LTV subir 10%?", "Simule inadimplencia de 5%".

## Regras
- Sempre responda em portugues do Brasil
- Chame EXATAMENTE UM agente por vez
- Voce pode chamar multiplos agentes em sequencia se a pergunta exigir dados de fontes diferentes
- Apos receber o resultado do agente, sintetize uma resposta clara e acionavel para o usuario
- Se a pergunta for ambigua, escolha o agente mais provavel e prossiga
- NUNCA tente responder sem chamar um agente — voce NAO tem conhecimento de dominio`;
```

- [ ] **Step 2: Create SQL Agent context**

```typescript
// src/shared/config/agents/sql-agent.ts
import type { AgentDynamicContext } from './types';

const STATIC_CONTEXT = `Voce e um especialista em SQL para BigQuery. Gere queries SELECT para responder perguntas sobre carteiras de credito imobiliario.

## Regras SQL
- APENAS SELECT (nunca INSERT, UPDATE, DELETE, DROP, CREATE)
- Use SAFE_DIVIDE para divisoes
- Formate valores monetarios como R$ com separador de milhar (.) e decimal (,)
- Porcentagens com 2 casas decimais
- Sempre inclua a query SQL executada na resposta
- Se a pergunta for ambigua, faca a query mais provavel e explique as premissas
- Use aliases legiveis em portugues para colunas

## Schema: Tabela contratos
-- Chave: id_contrato + data_base_report
-- 1 row = 1 contrato em 1 data_base
id_contrato         STRING    -- Identificador unico
data_base_report    DATE      -- Data-base (ultimo dia do mes)
projeto             STRING    -- Empreendimento (ex: "VIVA PARK")
documento           STRING    -- CPF/CNPJ do devedor
nome_cliente        STRING    -- Nome do devedor
proponent_type      STRING    -- "PF" ou "PJ"
unidade             INTEGER   -- Numero da unidade
data_emissao        DATE      -- Data de emissao
safra               STRING    -- Periodo de originacao (YYYY-MM)
saldo_devedor       FLOAT64   -- Saldo devedor atualizado (R$)
saldo_nominal       FLOAT64   -- Saldo nominal contratado (R$)
valor_imovel        FLOAT64   -- Valor do imovel (R$)
ltv                 FLOAT64   -- saldo_devedor / valor_imovel
faixa_ltv           STRING    -- "0-30%","30-50%","50-70%","70-80%","80-90%","90-100%",">100%"
rating_liquid       STRING    -- A(baixo risco) a H(default certo)
elegibilidade       STRING    -- "Elegivel" ou "Nao Elegivel"
dias_atraso         INTEGER   -- Dias em atraso (0=adimplente)
faixa_atraso        STRING    -- "Adimplente","1 a 30","31 a 60","61 a 90","91 a 120","121 a 150","151 a 180","> 180"
valor_atraso        FLOAT64   -- Valor em atraso (R$)
valor_over_90       FLOAT64   -- Valor com atraso > 90 dias (R$)
pdd_minimo_bacen    FLOAT64   -- PDD minimo Bacen (Res. 2682)
pdd_liquid          FLOAT64   -- PDD modelo Liquid
delta_pdd           FLOAT64   -- pdd_liquid - pdd_minimo_bacen
pricing             FLOAT64   -- Valor de mercado do contrato
correcao_monetaria  FLOAT64   -- Indice de correcao
prazo_decorrido     FLOAT64   -- Meses desde emissao
prazo_remanescente  FLOAT64   -- Meses ate vencimento
restricoes          INTEGER   -- Qtd restricoes (PEFIN/REFIN)
grupos_repasse      STRING    -- "Grupo 1" a "Grupo 4"
renda_suficiente    FLOAT64   -- Indicador de renda suficiente
limite_simulacao    FLOAT64   -- Limite para simulacao repasse
private_area        FLOAT64   -- Area privativa (m2)

## Schema: Tabela pagamentos
data_base_report    DATE      -- Data-base
projeto             STRING    -- Empreendimento
tipo_recebimento    STRING    -- "Pagamento antecipado", "Vencimento na referencia", "Recuperacao mes anterior", "Recuperacao anterior"
valor_pago          FLOAT64   -- Valor recebido (R$)

## Schema: Tabela fluxo_caixa
data_base_fluxo     DATE      -- Data do fluxo projetado
data_base_report    DATE      -- Data-base de referencia
projeto             STRING    -- Empreendimento
fluxo_esperado      FLOAT64   -- Fluxo ajustado por risco (R$)
fluxo_contratado    FLOAT64   -- Fluxo total contratado (R$)

## Formulas derivadas comuns
inadimplencia_pct = SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100
ltv_medio = AVG(ltv)
over_90_pct = SAFE_DIVIDE(COUNTIF(dias_atraso > 90), COUNT(DISTINCT id_contrato)) * 100
desagio = SAFE_DIVIDE(SUM(pricing) - SUM(saldo_nominal), SUM(saldo_nominal)) * 100
pct_contratos = SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER()) * 100`;

export function buildSqlAgentPrompt(ctx: AgentDynamicContext): string {
  const parts = [STATIC_CONTEXT];
  parts.push(`\n## Contexto dinamico`);
  parts.push(`Dataset: \`${ctx.dataset}\``);
  parts.push(`Periodo ativo: ${ctx.filters.dateRange.start} a ${ctx.filters.dateRange.end}`);
  if (ctx.filters.projetos.length > 0) {
    parts.push(`Projetos filtrados: ${ctx.filters.projetos.join(', ')}`);
  }
  const af = ctx.filters.advancedFilters;
  if (af.ratings.length > 0) parts.push(`Ratings filtrados: ${af.ratings.join(', ')}`);
  if (af.elegibilidade.length > 0) parts.push(`Elegibilidade: ${af.elegibilidade.join(', ')}`);
  if (af.faixaAtraso.length > 0) parts.push(`Faixa atraso: ${af.faixaAtraso.join(', ')}`);
  if (af.faixaLtv.length > 0) parts.push(`Faixa LTV: ${af.faixaLtv.join(', ')}`);
  if (af.tipoProponente.length > 0) parts.push(`Tipo proponente: ${af.tipoProponente.join(', ')}`);
  if (af.gruposRepasse.length > 0) parts.push(`Grupos repasse: ${af.gruposRepasse.join(', ')}`);
  parts.push(`\nUse o dataset \`${ctx.dataset}\` em todas as queries. Ex: \`SELECT ... FROM \`${ctx.dataset}.contratos\` WHERE ...\``);
  return parts.join('\n');
}
```

- [ ] **Step 3: Create business-agent.ts**

```typescript
// src/shared/config/agents/business-agent.ts
import type { AgentDynamicContext } from './types';
import { GLOSSARY } from '@/shared/config/glossary';

const glossaryText = Object.entries(GLOSSARY)
  .map(([key, desc]) => `- **${key}**: ${desc}`)
  .join('\n');

const STATIC_CONTEXT = `Voce e um especialista em securitizacao de credito imobiliario. Explique conceitos, regras de negocio e formulas.

## Glossario completo
${glossaryText}

## Rating Liquid (A-H)
- A: Score 900-1000, Baixo Risco
- B: Score 800-899, Baixo a Moderado
- C: Score 700-799, Moderado
- D: Score 600-699, Moderado a Alto
- E: Score 500-599, Alto Risco
- F: Score 400-499, Muito Alto
- G: Score 300-399, Quase Certo Default
- H: Score 0-299, Certeza Default

## Regras de PDD
- PDD Bacen (Res. 2682): provisao minima baseada em dias de atraso (0-30d=0.5%, 31-60d=1%, 61-90d=3%, 91-120d=10%, 121-150d=30%, 151-180d=50%, >180d=70-100%)
- PDD Liquid: modelo proprietario baseado na probabilidade de inadimplencia do rating
- delta_pdd = pdd_liquid - pdd_minimo_bacen

## Formulas
- LTV = saldo_devedor / valor_imovel
- Inadimplencia = valor_atraso / saldo_devedor
- Desagio = (pricing - saldo_nominal) / saldo_nominal
- Over 90 = contratos com dias_atraso > 90 / total contratos

## Regras
- Responda sempre em portugues do Brasil
- Cite a fonte (glossario, regra Bacen, formula)
- Se o termo nao estiver no glossario, explique com base no conhecimento de securitizacao`;

export function buildBusinessAgentPrompt(_ctx: AgentDynamicContext): string {
  return STATIC_CONTEXT;
}
```

- [ ] **Step 4: Create dashboard-agent.ts**

```typescript
// src/shared/config/agents/dashboard-agent.ts
import type { AgentDynamicContext } from './types';

const STATIC_CONTEXT = `Voce e um analista que interpreta o dashboard de carteira. Analise os KPIs, graficos e tabelas visiveis e forneca insights.

## Regras
- Use APENAS os dados fornecidos no contexto do dashboard
- Identifique tendencias (subindo, caindo, estavel)
- Destaque valores fora do padrao
- Sugira acoes baseadas nos indicadores
- Responda sempre em portugues do Brasil`;

export function buildDashboardAgentPrompt(ctx: AgentDynamicContext): string {
  if (!ctx.dashboardState) {
    return STATIC_CONTEXT + '\n\n## AVISO: Nenhum dado do dashboard disponivel. Informe ao usuario para navegar a uma pagina com dados.';
  }
  return `${STATIC_CONTEXT}\n\n## Estado atual do Dashboard\n\n${ctx.dashboardState}`;
}
```

- [ ] **Step 5: Create comparison-agent.ts**

```typescript
// src/shared/config/agents/comparison-agent.ts
import type { AgentDynamicContext } from './types';

const STATIC_CONTEXT = `Voce e um analista de tendencias para carteiras de credito imobiliario. Compare periodos, identifique tendencias e detecte anomalias.

## Metodologia
- MoM (Month-over-Month): comparacao mes a mes
- YoY (Year-over-Year): comparacao com mesmo mes do ano anterior
- Range vs Range: comparacao entre dois periodos arbitrarios

## Polaridade das metricas (positiveIsGood)
- total_contratos: true (mais contratos = carteira maior)
- saldo_devedor: neutral (depende do contexto)
- inadimplencia_pct: false (menos = melhor)
- valor_atraso: false (menos = melhor)
- over_90_pct: false (menos = melhor)
- ltv_medio: false (menos = menos risco)
- pagamento_antecipado: true (mais = melhor liquidez)
- fluxo_esperado: true (mais = melhor)

## Formato de resposta
- Sempre mostre: valor periodo 1, valor periodo 2, variacao absoluta, variacao percentual
- Indique se a variacao e positiva ou negativa para o negocio
- Destaque variacoes acima de 10% como significativas
- Responda sempre em portugues do Brasil`;

export function buildComparisonAgentPrompt(ctx: AgentDynamicContext): string {
  const parts = [STATIC_CONTEXT];
  parts.push(`\n## Contexto`);
  parts.push(`Periodo ativo: ${ctx.filters.dateRange.start} a ${ctx.filters.dateRange.end}`);
  if (ctx.filters.compareEnabled && ctx.filters.comparePeriod) {
    parts.push(`Periodo de comparacao: ${ctx.filters.comparePeriod.start} a ${ctx.filters.comparePeriod.end}`);
  }
  return parts.join('\n');
}
```

- [ ] **Step 6: Create external-agent.ts**

```typescript
// src/shared/config/agents/external-agent.ts
import type { AgentDynamicContext } from './types';

const STATIC_CONTEXT = `Voce e um especialista em indicadores economicos relevantes para securitizacao de credito imobiliario.

## Indicadores disponiveis via API do Banco Central (BCB SGS)
- selic_meta (cod 432): Taxa Selic meta definida pelo COPOM
- selic_over (cod 1178): Taxa Selic efetiva (overnight)
- ipca (cod 433): Indice de Precos ao Consumidor Amplo (inflacao oficial)
- igpm (cod 189): Indice Geral de Precos - Mercado (FGV)
- cdi (cod 4389): Certificado de Deposito Interbancario
- cambio_usd (cod 1): Taxa de cambio USD/BRL

## Fontes confiaveis
- Banco Central do Brasil (BCB): taxas, indicadores monetarios
- IBGE: inflacao, dados demograficos
- B3: mercado de capitais, CRI/CRA
- CVM: regulacao de securitizacao

## Correlacoes conhecidas
- Selic alta → inadimplencia tende a subir (custo do credito)
- IPCA alto → correcao monetaria dos contratos sobe
- Cambio alto → impacto indireto via custos de construcao

## Regras
- Sempre cite a fonte e a data do dado
- Use a ferramenta get_bcb_indicator para dados do BCB (mais confiavel)
- Use search_web apenas para dados nao disponíveis no BCB
- Responda sempre em portugues do Brasil`;

export function buildExternalAgentPrompt(_ctx: AgentDynamicContext): string {
  return STATIC_CONTEXT;
}
```

- [ ] **Step 7: Create export-agent.ts**

```typescript
// src/shared/config/agents/export-agent.ts
import type { AgentDynamicContext } from './types';

const STATIC_CONTEXT = `Voce gera relatorios PDF e CSV para download. Use as ferramentas generate_pdf e generate_csv.

## Formato PDF
- Titulo: nome do relatorio
- Subtitulo: periodo + cliente
- Secoes com tabelas de dados
- Cor do header: laranja (#F3A169)

## Formato CSV
- Separador: ponto-e-virgula (;) — padrao Excel BR
- Encoding: UTF-8 com BOM
- Colunas com nomes legiveis em portugues

## Formatacao de dados
- Moeda: R$ com separador de milhar (.) e decimal (,)
- Datas: DD/MM/YYYY
- Porcentagens: com 2 casas decimais e sufixo %
- Responda sempre em portugues do Brasil`;

export function buildExportAgentPrompt(ctx: AgentDynamicContext): string {
  if (!ctx.dashboardState) {
    return STATIC_CONTEXT + '\n\n## AVISO: Sem dados do dashboard para exportar. Informe ao usuario para navegar a uma pagina primeiro.';
  }
  return `${STATIC_CONTEXT}\n\n## Dados disponiveis para exportacao\n\n${ctx.dashboardState}`;
}
```

- [ ] **Step 8: Create simulation-agent.ts**

```typescript
// src/shared/config/agents/simulation-agent.ts
import type { AgentDynamicContext } from './types';

const STATIC_CONTEXT = `Voce e um simulador financeiro para carteiras de credito imobiliario. Execute cenarios what-if e mostre o impacto.

## Tipos de simulacao

### ltv_stress
Simula variacao no valor dos imoveis e recalcula LTV e elegibilidade.
- Parametro: percentual_variacao (float, ex: -0.10 para queda de 10%)
- Formula: novo_ltv = saldo_devedor / (valor_imovel * (1 + percentual_variacao))
- Impacto: contratos podem mudar de faixa_ltv e perder elegibilidade

### pdd_scenario
Recalcula PDD sob diferentes premissas de inadimplencia.
- Parametro: inadimplencia_alvo (float, ex: 0.05 para 5%)
- Formula: nova_pdd = saldo_devedor * inadimplencia_alvo * fator_rating
- fator_rating: A=0.5, B=0.6, C=0.7, D=0.8, E=0.9, F=1.0, G=1.0, H=1.0

### pricing_sensitivity
Simula variacao na taxa de desconto sobre pricing.
- Parametro: spread_bps (integer, ex: 50 para +50bps)
- Formula: novo_pricing = pricing * (1 - spread_bps/10000)

### elegibilidade_filter
Simula mudanca nos criterios de elegibilidade.
- Parametros: max_ltv (float), max_dias_atraso (int), min_rating (string A-H)
- Logica: contrato elegivel se ltv <= max_ltv AND dias_atraso <= max_dias_atraso AND rating >= min_rating

## Regras
- Sempre mostre: baseline (atual) vs simulado com variacao absoluta e percentual
- Explicite TODAS as premissas assumidas
- Use execute_sql para buscar dados base do BigQuery
- Responda sempre em portugues do Brasil`;

export function buildSimulationAgentPrompt(ctx: AgentDynamicContext): string {
  const parts = [STATIC_CONTEXT];
  parts.push(`\n## Contexto`);
  parts.push(`Dataset: \`${ctx.dataset}\``);
  parts.push(`Periodo: ${ctx.filters.dateRange.start} a ${ctx.filters.dateRange.end}`);
  if (ctx.filters.projetos.length > 0) {
    parts.push(`Projetos: ${ctx.filters.projetos.join(', ')}`);
  }
  return parts.join('\n');
}
```

- [ ] **Step 4: Create index.ts**

```typescript
// src/shared/config/agents/index.ts
export * from './types';
export { ORCHESTRATOR_SYSTEM_PROMPT } from './orchestrator';
export { buildSqlAgentPrompt } from './sql-agent';
export { buildBusinessAgentPrompt } from './business-agent';
export { buildDashboardAgentPrompt } from './dashboard-agent';
export { buildComparisonAgentPrompt } from './comparison-agent';
export { buildExternalAgentPrompt } from './external-agent';
export { buildExportAgentPrompt } from './export-agent';
export { buildSimulationAgentPrompt } from './simulation-agent';
```

- [ ] **Step 5: Verify all files compile**

```bash
npx tsc --noEmit 2>&1 | grep "agents/" | head -10
```
Expected: No errors from agents/ files.

- [ ] **Step 6: Commit**

```bash
git add src/shared/config/agents/
git commit -m "feat: add agent context configs with system prompts and dynamic context builders"
```

---

## Chunk 2: Tools — Shared Tool Implementations

### Task 5: Create execute-sql tool with guardrails

**Files:**
- Create: `src/features/ai-agents/tools/execute-sql.ts`

- [ ] **Step 1: Create the tool**

```typescript
// src/features/ai-agents/tools/execute-sql.ts
import { tool } from 'ai';
import { z } from 'zod';
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery();

function validateSelectOnly(query: string): { valid: boolean; error?: string } {
  const trimmed = query.trim().replace(/^\/\*[\s\S]*?\*\//g, '').trim();
  const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
  if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
    return { valid: false, error: `Apenas SELECT permitido. Recebido: ${firstWord}` };
  }
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE)\b/i;
  if (forbidden.test(trimmed)) {
    return { valid: false, error: 'Query contem operacao proibida (INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/TRUNCATE/MERGE)' };
  }
  return { valid: true };
}

export function createExecuteSqlTool(dataset: string) {
  return tool({
    description: 'Executa uma query SELECT no BigQuery e retorna os resultados. Apenas SELECT permitido. Timeout de 60 segundos.',
    inputSchema: z.object({
      query: z.string().describe('Query SQL SELECT para executar no BigQuery'),
    }),
    execute: async ({ query }) => {
      const validation = validateSelectOnly(query);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      try {
        const [rows] = await bigquery.query({
          query,
          defaultDataset: { datasetId: dataset },
          timeoutMs: 60000,
          useLegacySql: false,
        });
        return {
          success: true,
          rowCount: rows.length,
          data: rows,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erro na execucao da query',
          query,
        };
      }
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-agents/tools/execute-sql.ts
git commit -m "feat: add execute-sql tool with SELECT-only guardrails and 60s timeout"
```

### Task 6: Create get-table-schema tool

**Files:**
- Create: `src/features/ai-agents/tools/get-table-schema.ts`

- [ ] **Step 1: Create the tool**

```typescript
// src/features/ai-agents/tools/get-table-schema.ts
import { tool } from 'ai';
import { z } from 'zod';
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery();

const VALID_TABLES = ['contratos', 'pagamentos', 'fluxo_caixa'];

export function createGetTableSchemaTool(dataset: string) {
  return tool({
    description: 'Retorna o schema detalhado de uma tabela do BigQuery (campos, tipos, descricoes).',
    inputSchema: z.object({
      table: z.enum(['contratos', 'pagamentos', 'fluxo_caixa']).describe('Nome da tabela'),
    }),
    execute: async ({ table }) => {
      if (!VALID_TABLES.includes(table)) {
        return { success: false, error: `Tabela invalida: ${table}. Validas: ${VALID_TABLES.join(', ')}` };
      }
      try {
        const [metadata] = await bigquery.dataset(dataset).table(table).getMetadata();
        const fields = metadata.schema?.fields?.map((f: { name: string; type: string; description?: string }) => ({
          name: f.name,
          type: f.type,
          description: f.description ?? '',
        })) ?? [];
        return { success: true, table, fields };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erro ao obter schema' };
      }
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-agents/tools/get-table-schema.ts
git commit -m "feat: add get-table-schema tool for BigQuery introspection"
```

### Task 6b: Create get-sample-data tool

**Files:**
- Create: `src/features/ai-agents/tools/get-sample-data.ts`

- [ ] **Step 1: Create the tool**

```typescript
// src/features/ai-agents/tools/get-sample-data.ts
import { tool } from 'ai';
import { z } from 'zod';
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery();
const VALID_TABLES = ['contratos', 'pagamentos', 'fluxo_caixa'];

export function createGetSampleDataTool(dataset: string) {
  return tool({
    description: 'Retorna N rows de amostra de uma tabela para entender o formato e valores dos dados.',
    inputSchema: z.object({
      table: z.enum(['contratos', 'pagamentos', 'fluxo_caixa']).describe('Nome da tabela'),
      n: z.number().optional().default(5).describe('Quantidade de rows (default: 5, max: 20)'),
    }),
    execute: async ({ table, n }) => {
      if (!VALID_TABLES.includes(table)) {
        return { success: false, error: `Tabela invalida: ${table}` };
      }
      const limit = Math.min(n ?? 5, 20);
      try {
        const [rows] = await bigquery.query({
          query: `SELECT * FROM \`${dataset}.${table}\` LIMIT ${limit}`,
          useLegacySql: false,
        });
        return { success: true, table, rowCount: rows.length, data: rows };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erro ao obter amostra' };
      }
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-agents/tools/get-sample-data.ts
git commit -m "feat: add get-sample-data tool for BigQuery data exploration"
```

### Task 7: Create remaining tools

**Files:**
- Create: `src/features/ai-agents/tools/search-web.ts`
- Create: `src/features/ai-agents/tools/get-bcb-indicator.ts`
- Create: `src/features/ai-agents/tools/generate-pdf.ts`
- Create: `src/features/ai-agents/tools/generate-csv.ts`

- [ ] **Step 1: Create search-web tool**

```typescript
// src/features/ai-agents/tools/search-web.ts
import { tool } from 'ai';
import { z } from 'zod';

export const searchWebTool = tool({
  description: 'Busca dados economicos, indicadores de mercado e informacoes externas na web. Use para Selic, IPCA, IGPM, dados do setor imobiliario.',
  inputSchema: z.object({
    query: z.string().describe('Termo de busca em portugues, ex: "taxa selic atual 2026"'),
  }),
  execute: async ({ query }) => {
    if (!process.env.FIRECRAWL_API_KEY) {
      return { success: false, error: 'FIRECRAWL_API_KEY nao configurada' };
    }
    try {
      const Firecrawl = (await import('@mendable/firecrawl-js')).default;
      const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
      const results = await app.search(query, { limit: 5 }) as {
        data?: Array<{ url?: string; title?: string; markdown?: string }>;
      };
      if (!results.data || results.data.length === 0) {
        return { success: false, error: 'Nenhum resultado encontrado' };
      }
      return {
        success: true,
        data: results.data.map((r) => ({
          url: r.url,
          title: r.title,
          content: r.markdown?.substring(0, 2000),
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro na busca' };
    }
  },
});
```

- [ ] **Step 2: Create get-bcb-indicator tool**

```typescript
// src/features/ai-agents/tools/get-bcb-indicator.ts
import { tool } from 'ai';
import { z } from 'zod';

const BCB_CODES: Record<string, number> = {
  selic_meta: 432,
  selic_over: 1178,
  ipca: 433,
  igpm: 189,
  cdi: 4389,
  cambio_usd: 1,
};

export const getBcbIndicatorTool = tool({
  description: 'Consulta indicador economico do Banco Central do Brasil (BCB). Retorna serie historica.',
  inputSchema: z.object({
    indicator: z.enum(['selic_meta', 'selic_over', 'ipca', 'igpm', 'cdi', 'cambio_usd']).describe('Indicador economico'),
    lastN: z.number().optional().default(12).describe('Quantidade de ultimos registros (default: 12)'),
  }),
  execute: async ({ indicator, lastN }) => {
    const code = BCB_CODES[indicator];
    if (!code) return { success: false, error: `Indicador desconhecido: ${indicator}` };
    try {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/${lastN}?formato=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `BCB API retornou ${res.status}` };
      const data = await res.json();
      return { success: true, indicator, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro na consulta BCB' };
    }
  },
});
```

- [ ] **Step 3: Create generate-pdf tool**

```typescript
// src/features/ai-agents/tools/generate-pdf.ts
import { tool } from 'ai';
import { z } from 'zod';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';

export const generatePdfTool = tool({
  description: 'Gera relatorio PDF com dados tabulares. Retorna URL para download.',
  inputSchema: z.object({
    title: z.string().describe('Titulo do relatorio'),
    subtitle: z.string().optional().describe('Subtitulo (ex: periodo, cliente)'),
    sections: z.array(z.object({
      heading: z.string(),
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })).describe('Secoes do relatorio com tabelas'),
  }),
  execute: async ({ title, subtitle, sections }) => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(title, 14, 22);
      if (subtitle) {
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(subtitle, 14, 30);
        doc.setTextColor(0);
      }
      let y = subtitle ? 38 : 32;

      for (const section of sections) {
        doc.setFontSize(13);
        doc.text(section.heading, 14, y);
        y += 4;
        autoTable(doc, {
          startY: y,
          head: [section.columns],
          body: section.rows,
          theme: 'striped',
          styles: { fontSize: 9 },
          headStyles: { fillColor: [243, 161, 105] }, // brand orange
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      const filename = `report-${randomUUID().slice(0, 8)}.pdf`;
      const filepath = path.join('/tmp', filename);
      const buffer = Buffer.from(doc.output('arraybuffer'));
      await writeFile(filepath, buffer);

      return {
        success: true,
        filename,
        url: `/api/download/${filename}`,
        pageCount: doc.getNumberOfPages(),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro ao gerar PDF' };
    }
  },
});
```

- [ ] **Step 4: Create generate-csv tool**

```typescript
// src/features/ai-agents/tools/generate-csv.ts
import { tool } from 'ai';
import { z } from 'zod';
import { writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';

export const generateCsvTool = tool({
  description: 'Gera arquivo CSV a partir de dados tabulares. Retorna URL para download.',
  inputSchema: z.object({
    filename: z.string().optional().describe('Nome do arquivo (sem extensao)'),
    columns: z.array(z.string()).describe('Nomes das colunas'),
    rows: z.array(z.array(z.string())).describe('Dados das linhas'),
  }),
  execute: async ({ filename: customName, columns, rows }) => {
    try {
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const header = columns.map(escape).join(';');
      const body = rows.map(row => row.map(escape).join(';')).join('\n');
      const csv = `${header}\n${body}`;

      const filename = `${customName ?? `export-${randomUUID().slice(0, 8)}`}.csv`;
      const filepath = path.join('/tmp', filename);
      await writeFile(filepath, '\uFEFF' + csv, 'utf-8'); // BOM for Excel

      return {
        success: true,
        filename,
        url: `/api/download/${filename}`,
        rowCount: rows.length,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro ao gerar CSV' };
    }
  },
});
```

- [ ] **Step 5: Create download API route**

```typescript
// app/api/download/[filename]/route.ts
import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  // Sanitize: only allow alphanumeric, dash, dot
  if (!/^[\w-]+\.(pdf|csv)$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  try {
    const filepath = path.join('/tmp', filename);
    const buffer = await readFile(filepath);
    const ext = path.extname(filename).slice(1);
    const contentType = ext === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8';
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-agents/tools/ app/api/download/
git commit -m "feat: add all agent tools (search-web, bcb-indicator, pdf, csv, download route)"
```

---

## Chunk 3: Agent Factory + Orchestrator

### Task 8: Create the agent tool factory

**Files:**
- Create: `src/features/ai-agents/create-agent-tool.ts`

- [ ] **Step 1: Create the factory**

```typescript
// src/features/ai-agents/create-agent-tool.ts
import { tool, generateText, stepCountIs } from 'ai';
import { z } from 'zod';
import { getModel } from './model-registry';
import type { AgentConfig, AgentDynamicContext, PreliminaryResult } from '@/shared/config/agents/types';

export function createAgentTool(config: AgentConfig, dynamicContext: AgentDynamicContext) {
  return tool({
    description: config.description,
    inputSchema: z.object({
      query: z.string().describe('A pergunta do usuario para este agente responder'),
    }),
    async *execute({ query }) {
      const startTime = Date.now();

      // 1. Yield: analyzing
      yield {
        status: 'analyzing',
        agent: config.id,
        message: `Analisando com ${config.id.replace('_', ' ')}`,
      } satisfies PreliminaryResult;

      try {
        // 2. Build agent-specific prompt
        const system = config.buildSystemPrompt(dynamicContext);

        // 3. Run sub-agent
        const result = await generateText({
          model: getModel(config.model),
          system,
          tools: config.tools,
          stopWhen: stepCountIs(config.maxSteps),
          prompt: query,
        });

        // 4. Yield: done
        yield {
          status: 'done',
          agent: config.id,
          message: result.text,
          elapsedMs: Date.now() - startTime,
        } satisfies PreliminaryResult;

        return {
          agent: config.id,
          text: result.text,
          toolResults: result.steps.flatMap(s => s.toolResults),
        };
      } catch (error) {
        yield {
          status: 'error',
          agent: config.id,
          message: error instanceof Error ? error.message : 'Erro desconhecido',
          elapsedMs: Date.now() - startTime,
        } satisfies PreliminaryResult;

        return {
          agent: config.id,
          text: `Erro no ${config.id}: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
          toolResults: [],
        };
      }
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-agents/create-agent-tool.ts
git commit -m "feat: add createAgentTool factory with async generator for preliminary results"
```

### Task 9: Create individual agent builder functions

**Files:**
- Create: `src/features/ai-agents/agents/sql-agent.ts`
- Create: `src/features/ai-agents/agents/business-agent.ts`
- Create: `src/features/ai-agents/agents/dashboard-agent.ts`
- Create: `src/features/ai-agents/agents/comparison-agent.ts`
- Create: `src/features/ai-agents/agents/external-agent.ts`
- Create: `src/features/ai-agents/agents/export-agent.ts`
- Create: `src/features/ai-agents/agents/simulation-agent.ts`

- [ ] **Step 1: Create SQL Agent**

```typescript
// src/features/ai-agents/agents/sql-agent.ts
import { z } from 'zod';
import { buildSqlAgentPrompt } from '@/shared/config/agents';
import { createAgentTool } from '../create-agent-tool';
import { createExecuteSqlTool } from '../tools/execute-sql';
import { createGetTableSchemaTool } from '../tools/get-table-schema';
import { createGetSampleDataTool } from '../tools/get-sample-data';
import type { AgentConfig, AgentDynamicContext } from '@/shared/config/agents/types';

export function createSqlAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'sql_agent',
    description: 'Consulta dados especificos no BigQuery via SQL. Use para perguntas que exigem dados brutos, listas, filtros especificos ou agregacoes customizadas.',
    model: 'reasoning',
    maxSteps: 3,
    inputSchema: z.object({
      query: z.string().describe('Pergunta que requer consulta SQL ao BigQuery'),
    }),
    buildSystemPrompt: buildSqlAgentPrompt,
    tools: {
      execute_sql: createExecuteSqlTool(ctx.dataset),
      get_table_schema: createGetTableSchemaTool(ctx.dataset),
      get_sample_data: createGetSampleDataTool(ctx.dataset),
    },
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 2: Create business-agent.ts**

```typescript
// src/features/ai-agents/agents/business-agent.ts
import { tool } from 'ai';
import { z } from 'zod';
import { GLOSSARY } from '@/shared/config/glossary';
import { buildBusinessAgentPrompt } from '@/shared/config/agents';
import { createAgentTool } from '../create-agent-tool';
import type { AgentConfig, AgentDynamicContext } from '@/shared/config/agents/types';

function searchGlossary(term: string): string {
  const lower = term.toLowerCase();
  const exact = GLOSSARY[lower];
  if (exact) return `**${lower}**: ${exact}`;
  const matches = Object.entries(GLOSSARY)
    .filter(([k, v]) => k.includes(lower) || v.toLowerCase().includes(lower))
    .map(([k, v]) => `**${k}**: ${v}`);
  return matches.length > 0 ? matches.join('\n') : `Termo "${term}" nao encontrado no glossario.`;
}

export function createBusinessAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'business_agent',
    description: 'Explica conceitos, regras de negocio, formulas e termos de securitizacao de credito imobiliario.',
    model: 'fast',
    maxSteps: 1,
    inputSchema: z.object({ query: z.string() }),
    buildSystemPrompt: buildBusinessAgentPrompt,
    tools: {
      lookup_glossary: tool({
        description: 'Busca termo no glossario de securitizacao.',
        inputSchema: z.object({ term: z.string().describe('Termo a buscar') }),
        execute: async ({ term }) => ({ result: searchGlossary(term) }),
      }),
      get_indicator_definition: tool({
        description: 'Retorna definicao, formula e interpretacao de um KPI.',
        inputSchema: z.object({ kpi: z.string().describe('Nome do KPI') }),
        execute: async ({ kpi }) => ({ result: searchGlossary(kpi) }),
      }),
    },
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 3: Create dashboard-agent.ts**

```typescript
// src/features/ai-agents/agents/dashboard-agent.ts
import { tool } from 'ai';
import { z } from 'zod';
import { buildDashboardAgentPrompt } from '@/shared/config/agents';
import { createAgentTool } from '../create-agent-tool';
import type { AgentConfig, AgentDynamicContext } from '@/shared/config/agents/types';

export function createDashboardAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'dashboard_agent',
    description: 'Le e interpreta o estado atual do dashboard — KPIs, graficos, tabelas e filtros visiveis.',
    model: 'router',
    maxSteps: 1,
    inputSchema: z.object({ query: z.string() }),
    buildSystemPrompt: buildDashboardAgentPrompt,
    tools: {
      read_dashboard_state: tool({
        description: 'Retorna snapshot completo dos indicadores visiveis no dashboard.',
        inputSchema: z.object({}),
        execute: async () => ({
          data: ctx.dashboardState || 'Nenhum indicador carregado. Usuario precisa navegar a uma pagina.',
        }),
      }),
      read_active_filters: tool({
        description: 'Retorna filtros ativos com valores legiveis.',
        inputSchema: z.object({}),
        execute: async () => ({
          dateRange: ctx.filters.dateRange,
          projetos: ctx.filters.projetos.length > 0 ? ctx.filters.projetos : ['Todos'],
          advancedFilters: ctx.filters.advancedFilters,
          page: ctx.page,
        }),
      }),
    },
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 4: Create comparison-agent.ts**

```typescript
// src/features/ai-agents/agents/comparison-agent.ts
import { tool } from 'ai';
import { z } from 'zod';
import { comparePeriods, queryKpiHistory } from '@/shared/lib/bigquery/queries';
import { buildComparisonAgentPrompt } from '@/shared/config/agents';
import { createAgentTool } from '../create-agent-tool';
import type { AgentConfig, AgentDynamicContext } from '@/shared/config/agents/types';

export function createComparisonAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'comparison_agent',
    description: 'Analisa tendencias, compara periodos e detecta anomalias em metricas da carteira.',
    model: 'reasoning',
    maxSteps: 3,
    inputSchema: z.object({ query: z.string() }),
    buildSystemPrompt: buildComparisonAgentPrompt,
    tools: {
      compare_periods: tool({
        description: 'Compara uma metrica entre dois periodos.',
        inputSchema: z.object({
          table: z.enum(['contratos', 'pagamentos', 'fluxo_caixa']),
          period1Start: z.string(), period1End: z.string(),
          period2Start: z.string(), period2End: z.string(),
          metric: z.string(),
        }),
        execute: async ({ table, period1Start, period1End, period2Start, period2End, metric }) => {
          try {
            const result = await comparePeriods(
              table,
              { start: period1Start, end: period1End },
              { start: period2Start, end: period2End },
              metric, ctx.dataset,
            );
            return { success: true, data: result };
          } catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Erro' }; }
        },
      }),
      get_kpi_history: tool({
        description: 'Retorna serie temporal mensal de KPIs para analise de tendencia.',
        inputSchema: z.object({
          months: z.number().optional().default(12).describe('Quantidade de meses'),
        }),
        execute: async ({ months }) => {
          try {
            const startDate = new Date(ctx.filters.dateRange.end);
            startDate.setMonth(startDate.getMonth() - months);
            const result = await queryKpiHistory(
              ctx.filters.dateRange.end,
              ctx.filters.projetos[0],
              startDate.toISOString().slice(0, 10),
              undefined, ctx.dataset,
            );
            return { success: true, data: result };
          } catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Erro' }; }
        },
      }),
      detect_anomalies: tool({
        description: 'Identifica pontos fora do padrao na serie de KPIs (>2 desvios padrao).',
        inputSchema: z.object({
          metric: z.string().describe('Nome da metrica (ex: inadimplencia_pct, saldo_devedor)'),
        }),
        execute: async ({ metric }) => {
          try {
            const data = await queryKpiHistory(
              ctx.filters.dateRange.end, ctx.filters.projetos[0],
              undefined, undefined, ctx.dataset,
            );
            if (!data || data.length < 3) return { success: false, error: 'Dados insuficientes' };
            const values = data.map((d: Record<string, unknown>) => Number(d[metric]) || 0);
            const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
            const stdDev = Math.sqrt(values.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / values.length);
            const anomalies = data
              .map((d: Record<string, unknown>, i: number) => ({ ...d, value: values[i], zScore: (values[i] - mean) / (stdDev || 1) }))
              .filter((d: { zScore: number }) => Math.abs(d.zScore) > 2);
            return { success: true, mean, stdDev, anomalies, totalPoints: values.length };
          } catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Erro' }; }
        },
      }),
    },
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 5: Create external-agent.ts**

```typescript
// src/features/ai-agents/agents/external-agent.ts
import { z } from 'zod';
import { buildExternalAgentPrompt } from '@/shared/config/agents';
import { createAgentTool } from '../create-agent-tool';
import { searchWebTool } from '../tools/search-web';
import { getBcbIndicatorTool } from '../tools/get-bcb-indicator';
import type { AgentConfig, AgentDynamicContext } from '@/shared/config/agents/types';

export function createExternalAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'external_agent',
    description: 'Busca dados economicos externos — Selic, IPCA, IGPM, mercado imobiliario.',
    model: 'fast',
    maxSteps: 2,
    inputSchema: z.object({ query: z.string() }),
    buildSystemPrompt: buildExternalAgentPrompt,
    tools: {
      search_web: searchWebTool,
      get_bcb_indicator: getBcbIndicatorTool,
    },
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 6: Create export-agent.ts**

```typescript
// src/features/ai-agents/agents/export-agent.ts
import { z } from 'zod';
import { buildExportAgentPrompt } from '@/shared/config/agents';
import { createAgentTool } from '../create-agent-tool';
import { generatePdfTool } from '../tools/generate-pdf';
import { generateCsvTool } from '../tools/generate-csv';
import type { AgentConfig, AgentDynamicContext } from '@/shared/config/agents/types';

export function createExportAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'export_agent',
    description: 'Gera relatorios PDF e CSV para download.',
    model: 'router',
    maxSteps: 1,
    inputSchema: z.object({ query: z.string() }),
    buildSystemPrompt: buildExportAgentPrompt,
    tools: {
      generate_pdf: generatePdfTool,
      generate_csv: generateCsvTool,
    },
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 7: Create simulation-agent.ts**

```typescript
// src/features/ai-agents/agents/simulation-agent.ts
import { tool } from 'ai';
import { z } from 'zod';
import { buildSimulationAgentPrompt } from '@/shared/config/agents';
import { createAgentTool } from '../create-agent-tool';
import { createExecuteSqlTool } from '../tools/execute-sql';
import type { AgentConfig, AgentDynamicContext } from '@/shared/config/agents/types';

export function createSimulationAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'simulation_agent',
    description: 'Executa cenarios what-if: stress de LTV, simulacao de PDD, sensibilidade de pricing, filtros de elegibilidade.',
    model: 'reasoning',
    maxSteps: 3,
    inputSchema: z.object({ query: z.string() }),
    buildSystemPrompt: buildSimulationAgentPrompt,
    tools: {
      execute_sql: createExecuteSqlTool(ctx.dataset),
      run_simulation: tool({
        description: 'Executa uma simulacao what-if. Busca dados base via SQL, aplica transformacao e retorna baseline vs simulado.',
        inputSchema: z.object({
          scenario: z.enum(['ltv_stress', 'pdd_scenario', 'pricing_sensitivity', 'elegibilidade_filter']),
          params: z.record(z.unknown()).describe('Parametros do cenario. ltv_stress: {percentual_variacao}. pdd_scenario: {inadimplencia_alvo}. pricing_sensitivity: {spread_bps}. elegibilidade_filter: {max_ltv, max_dias_atraso, min_rating}'),
        }),
        execute: async ({ scenario, params }) => {
          const { BigQuery } = await import('@google-cloud/bigquery');
          const bq = new BigQuery();
          const ds = ctx.dataset;
          const dateEnd = ctx.filters.dateRange.end;
          const projetoFilter = ctx.filters.projetos.length > 0
            ? `AND projeto IN (${ctx.filters.projetos.map(p => `'${p}'`).join(',')})`
            : '';

          try {
            if (scenario === 'ltv_stress') {
              const pct = Number(params.percentual_variacao) || -0.10;
              const [rows] = await bq.query({
                query: `
                  SELECT
                    COUNT(*) as total_contratos,
                    AVG(ltv) as ltv_medio_atual,
                    AVG(SAFE_DIVIDE(saldo_devedor, valor_imovel * (1 + ${pct}))) as ltv_medio_simulado,
                    COUNTIF(SAFE_DIVIDE(saldo_devedor, valor_imovel * (1 + ${pct})) > 0.8) as contratos_ltv_acima_80_simulado,
                    COUNTIF(ltv > 0.8) as contratos_ltv_acima_80_atual,
                    COUNTIF(elegibilidade = 'Elegivel') as elegiveis_atual,
                    COUNTIF(elegibilidade = 'Elegivel' AND SAFE_DIVIDE(saldo_devedor, valor_imovel * (1 + ${pct})) <= 0.9) as elegiveis_simulado
                  FROM \`${ds}.contratos\`
                  WHERE data_base_report = '${dateEnd}' ${projetoFilter}
                `,
                useLegacySql: false,
              });
              return { success: true, scenario, params: { percentual_variacao: pct }, baseline_vs_simulado: rows[0] };
            }

            if (scenario === 'pdd_scenario') {
              const alvo = Number(params.inadimplencia_alvo) || 0.05;
              const ratingFactors = { A: 0.5, B: 0.6, C: 0.7, D: 0.8, E: 0.9, F: 1.0, G: 1.0, H: 1.0 };
              const caseWhen = Object.entries(ratingFactors)
                .map(([r, f]) => `WHEN rating_liquid = '${r}' THEN saldo_devedor * ${alvo} * ${f}`)
                .join(' ');
              const [rows] = await bq.query({
                query: `
                  SELECT
                    SUM(pdd_liquid) as pdd_atual,
                    SUM(CASE ${caseWhen} ELSE saldo_devedor * ${alvo} END) as pdd_simulado,
                    SUM(pdd_minimo_bacen) as pdd_bacen
                  FROM \`${ds}.contratos\`
                  WHERE data_base_report = '${dateEnd}' ${projetoFilter}
                `,
                useLegacySql: false,
              });
              return { success: true, scenario, params: { inadimplencia_alvo: alvo }, baseline_vs_simulado: rows[0] };
            }

            if (scenario === 'pricing_sensitivity') {
              const bps = Number(params.spread_bps) || 50;
              const [rows] = await bq.query({
                query: `
                  SELECT
                    SUM(pricing) as pricing_atual,
                    SUM(pricing * (1 - ${bps}/10000)) as pricing_simulado,
                    SUM(saldo_nominal) as saldo_nominal,
                    SAFE_DIVIDE(SUM(pricing) - SUM(saldo_nominal), SUM(saldo_nominal)) * 100 as desagio_atual,
                    SAFE_DIVIDE(SUM(pricing * (1 - ${bps}/10000)) - SUM(saldo_nominal), SUM(saldo_nominal)) * 100 as desagio_simulado
                  FROM \`${ds}.contratos\`
                  WHERE data_base_report = '${dateEnd}' ${projetoFilter}
                `,
                useLegacySql: false,
              });
              return { success: true, scenario, params: { spread_bps: bps }, baseline_vs_simulado: rows[0] };
            }

            if (scenario === 'elegibilidade_filter') {
              const maxLtv = Number(params.max_ltv) || 0.9;
              const maxDias = Number(params.max_dias_atraso) || 0;
              const minRating = String(params.min_rating || 'C');
              const ratingOrder = ['A','B','C','D','E','F','G','H'];
              const validRatings = ratingOrder.slice(0, ratingOrder.indexOf(minRating) + 1);
              const ratingIn = validRatings.map(r => `'${r}'`).join(',');
              const [rows] = await bq.query({
                query: `
                  SELECT
                    COUNT(*) as total_contratos,
                    COUNTIF(elegibilidade = 'Elegivel') as elegiveis_atual,
                    COUNTIF(ltv <= ${maxLtv} AND dias_atraso <= ${maxDias} AND rating_liquid IN (${ratingIn})) as elegiveis_simulado,
                    SUM(IF(elegibilidade = 'Elegivel', saldo_devedor, 0)) as saldo_elegivel_atual,
                    SUM(IF(ltv <= ${maxLtv} AND dias_atraso <= ${maxDias} AND rating_liquid IN (${ratingIn}), saldo_devedor, 0)) as saldo_elegivel_simulado
                  FROM \`${ds}.contratos\`
                  WHERE data_base_report = '${dateEnd}' ${projetoFilter}
                `,
                useLegacySql: false,
              });
              return { success: true, scenario, params: { max_ltv: maxLtv, max_dias_atraso: maxDias, min_rating: minRating }, baseline_vs_simulado: rows[0] };
            }

            return { success: false, error: `Cenario desconhecido: ${scenario}` };
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Erro na simulacao' };
          }
        },
      }),
    },
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/agents/
git commit -m "feat: add all 7 agent builder functions"
```

### Task 10: Create the orchestrator

**Files:**
- Create: `src/features/ai-agents/orchestrator.ts`

- [ ] **Step 1: Create orchestrator**

```typescript
// src/features/ai-agents/orchestrator.ts
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '@/shared/config/agents';
import type { AgentDynamicContext, ChatRequestFilters } from '@/shared/config/agents/types';
import { getModel } from './model-registry';
import { createSqlAgent } from './agents/sql-agent';
import { createBusinessAgent } from './agents/business-agent';
import { createDashboardAgent } from './agents/dashboard-agent';
import { createComparisonAgent } from './agents/comparison-agent';
import { createExternalAgent } from './agents/external-agent';
import { createExportAgent } from './agents/export-agent';
import { createSimulationAgent } from './agents/simulation-agent';

interface OrchestratorInput {
  messages: UIMessage[];
  dataset: string;
  filters: ChatRequestFilters;
  dashboardState: string;
  page: string;
}

export function createOrchestrator(input: OrchestratorInput) {
  const ctx: AgentDynamicContext = {
    dataset: input.dataset,
    filters: input.filters,
    dashboardState: input.dashboardState,
    page: input.page,
  };

  return streamText({
    model: getModel('router'),
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages: convertToModelMessages(input.messages),
    tools: {
      sql_agent: createSqlAgent(ctx),
      business_agent: createBusinessAgent(ctx),
      dashboard_agent: createDashboardAgent(ctx),
      comparison_agent: createComparisonAgent(ctx),
      external_agent: createExternalAgent(ctx),
      export_agent: createExportAgent(ctx),
      simulation_agent: createSimulationAgent(ctx),
    },
    stopWhen: stepCountIs(10),
    toolChoice: 'auto',
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-agents/orchestrator.ts
git commit -m "feat: add orchestrator with 7 agent tools and 10-step limit"
```

### Task 11: Rewrite the API route

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Rewrite the route**

Replace the entire file content. Preserve the `verifyAuthToken` function and dataset access check logic from the current file. The new route body:

```typescript
// app/api/chat/route.ts
import type { UIMessage } from 'ai';
import type { ChatRequestFilters } from '@/shared/config/agents/types';
import { createOrchestrator } from '@/features/ai-agents/orchestrator';

export const maxDuration = 300;

// ... keep verifyAuthToken and dataset access check as-is ...

export async function POST(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401 });
  }

  const body: {
    messages: UIMessage[];
    dataset: string;
    filters: ChatRequestFilters;
    dashboardState?: string;
    page: string;
  } = await req.json();

  // Dataset access check (keep existing Firestore logic)
  // ...

  const result = createOrchestrator({
    messages: body.messages,
    dataset: body.dataset,
    filters: body.filters,
    dashboardState: body.dashboardState ?? '',
    page: body.page,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Verify dev server starts**

```bash
pnpm dev
```
Expected: No compilation errors. Server starts on port 3000.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: rewrite chat API route to use multi-agent orchestrator"
```

---

## Chunk 4: Frontend — UI Components and AISidebar Updates

### Task 12: Create ToolStepIndicator component

**Files:**
- Create: `src/widgets/ai-sidebar/ui/ToolStepIndicator.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/widgets/ai-sidebar/ui/ToolStepIndicator.tsx
'use client';

import { cn } from '@/shared/lib/utils';
import {
  Sparkles, Brain, FileCode2, Database, CheckCircle2,
  Search, BarChart3, FlaskConical, Download, AlertTriangle, Loader2,
} from 'lucide-react';
import type { PreliminaryStatus } from '@/shared/config/agents/types';

const STATUS_CONFIG: Record<PreliminaryStatus, {
  label: string;
  icon: React.ElementType;
  color: string;
}> = {
  routing: { label: 'Roteando para {agent}', icon: Sparkles, color: 'text-purple-400/70' },
  analyzing: { label: 'Analisando pergunta', icon: Brain, color: 'text-blue-400/70' },
  generating_sql: { label: 'Gerando SQL', icon: FileCode2, color: 'text-amber-400/70' },
  executing_sql: { label: 'Executando query', icon: Database, color: 'text-cyan-400/70' },
  query_complete: { label: 'Query executada', icon: CheckCircle2, color: 'text-emerald-400/70' },
  searching: { label: 'Buscando dados econômicos', icon: Search, color: 'text-blue-400/70' },
  comparing: { label: 'Comparando períodos', icon: BarChart3, color: 'text-violet-400/70' },
  simulating: { label: 'Rodando simulação', icon: FlaskConical, color: 'text-pink-400/70' },
  exporting: { label: 'Gerando relatório', icon: Download, color: 'text-green-400/70' },
  done: { label: 'Concluído', icon: CheckCircle2, color: 'text-emerald-400/70' },
  error: { label: 'Erro', icon: AlertTriangle, color: 'text-red-400/70' },
};

interface ToolStepIndicatorProps {
  status: PreliminaryStatus;
  agent?: string;
  message?: string;
  sql?: string;
  rowCount?: number;
  elapsedMs?: number;
  isActive?: boolean;
}

export function ToolStepIndicator({
  status, agent, message, sql, rowCount, elapsedMs, isActive,
}: ToolStepIndicatorProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.analyzing;
  const Icon = config.icon;
  const isDone = status === 'done' || status === 'query_complete';
  const isError = status === 'error';

  let label = config.label;
  if (agent) label = label.replace('{agent}', agent.replace('_', ' '));
  if (message && isError) label = message;

  return (
    <div className={cn(
      'my-1 flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[11px] border transition-colors',
      isDone && 'bg-emerald-500/5 border-emerald-500/15',
      isError && 'bg-red-500/5 border-red-500/15',
      !isDone && !isError && 'bg-white/[0.03] border-white/[0.06]',
      isActive && !isDone && !isError && 'animate-pulse',
    )}>
      <div className="mt-0.5">
        {isActive && !isDone && !isError
          ? <Loader2 className={cn('h-3 w-3 animate-spin', config.color)} />
          : <Icon className={cn('h-3 w-3', config.color)} strokeWidth={1.5} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <span className={cn(config.color)}>{label}</span>
        {rowCount !== undefined && (
          <span className="ml-1 text-white/30">— {rowCount} rows</span>
        )}
        {elapsedMs !== undefined && (
          <span className="ml-1 text-white/30">{(elapsedMs / 1000).toFixed(1)}s</span>
        )}
        {sql && (
          <pre className="mt-1 overflow-x-auto rounded bg-black/30 px-2 py-1 text-[10px] text-cyan-400/60 font-mono whitespace-pre-wrap break-all">
            {sql.length > 200 ? sql.slice(0, 200) + '...' : sql}
          </pre>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/widgets/ai-sidebar/ui/ToolStepIndicator.tsx
git commit -m "feat: add ToolStepIndicator component for agent step timeline"
```

### Task 13: Create InlineDataRenderer and SqlPreview components

**Files:**
- Create: `src/widgets/ai-sidebar/ui/InlineDataRenderer.tsx`
- Create: `src/widgets/ai-sidebar/ui/SqlPreview.tsx`

- [ ] **Step 1: Create SqlPreview**

```tsx
// src/widgets/ai-sidebar/ui/SqlPreview.tsx
'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { ChevronDown, Copy, Check } from 'lucide-react';

interface SqlPreviewProps {
  sql: string;
}

export function SqlPreview({ sql }: SqlPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const firstLine = sql.split('\n')[0] ?? sql.slice(0, 80);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-1.5 rounded-lg border border-white/[0.06] bg-black/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[10px] text-cyan-400/60 hover:text-cyan-400/80 font-mono"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
        <span className="truncate flex-1 text-left">{expanded ? 'SQL' : firstLine}</span>
        <span
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          className="shrink-0 cursor-pointer hover:text-white/60"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </span>
      </button>
      {expanded && (
        <pre className="px-2.5 pb-2 text-[10px] text-cyan-400/60 font-mono whitespace-pre-wrap break-all leading-relaxed">
          {sql}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create InlineDataRenderer**

```tsx
// src/widgets/ai-sidebar/ui/InlineDataRenderer.tsx
'use client';

import { FileText, Download as DownloadIcon } from 'lucide-react';

interface InlineDataRendererProps {
  data: unknown;
}

export function InlineDataRenderer({ data }: InlineDataRendererProps) {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  // Download link (Export Agent result)
  if (d.url && d.filename) {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
        <FileText className="h-4 w-4 text-[#F3A169] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-white/70 truncate">{String(d.filename)}</div>
        </div>
        <a
          href={String(d.url)}
          download
          className="text-[11px] text-[#F3A169] hover:text-[#F3A169]/80 flex items-center gap-1"
        >
          <DownloadIcon className="h-3 w-3" /> Baixar
        </a>
      </div>
    );
  }

  // Table (SQL Agent result with rows)
  if (Array.isArray(d.data) && d.data.length > 0 && typeof d.data[0] === 'object') {
    const rows = d.data as Record<string, unknown>[];
    const cols = Object.keys(rows[0]);
    const display = rows.slice(0, 10);
    return (
      <div className="my-1.5 overflow-x-auto rounded-lg border border-white/[0.06]">
        <table className="w-full text-[10px]">
          <thead className="bg-white/[0.03] border-b border-white/[0.06]">
            <tr>
              {cols.map(c => (
                <th key={c} className="px-2 py-1 text-left font-medium text-white/50 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
              <tr key={i}>
                {cols.map(c => (
                  <td key={c} className="px-2 py-1 text-white/60 border-t border-white/[0.04] whitespace-nowrap">
                    {String(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 10 && (
          <div className="px-2 py-1 text-[10px] text-white/30 border-t border-white/[0.06]">
            Mostrando 10 de {rows.length} rows
          </div>
        )}
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/widgets/ai-sidebar/ui/InlineDataRenderer.tsx src/widgets/ai-sidebar/ui/SqlPreview.tsx
git commit -m "feat: add InlineDataRenderer and SqlPreview components"
```

### Task 14: Update AISidebar

**Files:**
- Modify: `src/widgets/ai-sidebar/ui/AISidebar.tsx`

- [ ] **Step 1: Update TOOL_LABELS to cover all 7 agents**

Replace the existing `TOOL_LABELS` map with labels for each agent tool:

```typescript
const TOOL_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  sql_agent: { label: 'Consultando banco de dados', icon: Database },
  business_agent: { label: 'Consultando regras de negócio', icon: BookOpen },
  dashboard_agent: { label: 'Lendo dashboard', icon: Sparkles },
  comparison_agent: { label: 'Comparando períodos', icon: BarChart3 },
  external_agent: { label: 'Buscando dados econômicos', icon: Search },
  export_agent: { label: 'Gerando relatório', icon: Download },
  simulation_agent: { label: 'Rodando simulação', icon: FlaskConical },
};
```

Import new icons from lucide-react: `BookOpen, BarChart3, FlaskConical, Download`.

- [ ] **Step 2: Update sendMessage body to send structured filters**

Change `handleSubmit` and `handleSuggestion` to send the new body format:

```typescript
const body = {
  dataset: activeDataset,
  filters: {
    dateRange: filterCtx?.dateRange ?? { start: '', end: '' },
    projetos: filterCtx?.projetos ?? [],
    advancedFilters: filterCtx?.advancedFilters ?? {
      ratings: [], elegibilidade: [], faixaLtv: [],
      faixaAtraso: [], tipoProponente: [], gruposRepasse: [],
    },
    compareEnabled: filterCtx?.compareEnabled ?? false,
    comparePeriod: filterCtx?.comparePeriod,
  },
  dashboardState: buildAIContext(), // Keep sending for Dashboard/Export agents
  page: pathname ?? '/dashboard',
};
sendMessage({ text: input }, { body });
```

Keep `buildAIContext` and `indicators` from the store — needed for `dashboardState`. Remove only the `pageContext` memoized string.

- [ ] **Step 3: Update SUGGESTIONS_BY_PAGE**

Add new suggestions that exercise the new agents:

```typescript
const SUGGESTIONS_BY_PAGE: Record<string, string[]> = {
  '/dashboard': [
    'Qual o resumo da carteira atual?',
    'Qual faixa de atraso tem mais contratos?',
    'Quais contratos têm maior inadimplência?', // SQL agent
    'Gere um PDF resumo da carteira', // Export agent
  ],
  // ... update other pages similarly
};
```

- [ ] **Step 4: Update MessageBubble to render preliminary results**

Replace the `default` case in `MessageBubble`'s part switch with this logic:

```tsx
// In MessageBubble, inside the parts.map switch:
default:
  if (part.type === 'tool-invocation') {
    const toolPart = part as {
      type: string;
      toolName?: string;
      state?: string;
      result?: unknown;
    };
    // Check for preliminary results (from async generator yields)
    if (toolPart.result && typeof toolPart.result === 'object') {
      const r = toolPart.result as Record<string, unknown>;
      // If it has a PreliminaryResult status field, render step indicator
      if (r.status && typeof r.status === 'string') {
        return (
          <ToolStepIndicator
            key={`${message.id}-${i}`}
            status={r.status as PreliminaryStatus}
            agent={r.agent as string}
            message={r.message as string}
            sql={r.sql as string}
            rowCount={r.rowCount as number}
            elapsedMs={r.elapsedMs as number}
            isActive={toolPart.state !== 'result'}
          />
        );
      }
      // If it has structured data (from final result), render inline
      if (r.text || r.data || r.url) {
        return <InlineDataRenderer key={`${message.id}-${i}`} data={r} />;
      }
    }
    // Fallback: simple tool indicator (loading/done)
    const config = TOOL_LABELS[toolPart.toolName ?? ''] ?? { label: toolPart.toolName ?? 'ferramenta', icon: Wrench };
    const Icon = config.icon;
    const isDone = toolPart.state === 'result';
    return (
      <div key={`${message.id}-${i}`} className={cn(
        'my-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] border transition-colors',
        isDone ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400/70'
               : 'bg-white/[0.03] border-white/[0.06] text-white/35 animate-pulse'
      )}>
        {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
        <span>{isDone ? `${config.label} ✓` : `${config.label}...`}</span>
      </div>
    );
  }
  return null;
```

Add imports at the top of AISidebar.tsx:

```typescript
import { ToolStepIndicator } from './ToolStepIndicator';
import { InlineDataRenderer } from './InlineDataRenderer';
import type { PreliminaryStatus } from '@/shared/config/agents/types';
```

Remove the old standalone `ToolIndicator` function — replaced by the inline rendering + `ToolStepIndicator`.

- [ ] **Step 5: Test manually**

```bash
pnpm dev
```
Open browser → navigate to dashboard → open AI sidebar → ask "Quais contratos têm mais de 90 dias de atraso?" → verify:
1. Orchestrator routes to sql_agent
2. Step indicators show (analyzing → generating SQL → executing → done)
3. Response contains actual contract data
4. No console errors

- [ ] **Step 6: Commit**

```bash
git add src/widgets/ai-sidebar/ui/AISidebar.tsx
git commit -m "feat: update AISidebar for multi-agent architecture with step indicators and structured filters"
```

### Task 15: Final integration test

- [ ] **Step 1: Test each agent type**

With `pnpm dev` running, test these prompts in the AI sidebar:

| Prompt | Expected Agent | Verify |
|---|---|---|
| "Quais contratos têm mais de 90 dias de atraso?" | sql_agent | Returns contract list from BigQuery |
| "O que é PDD Liquid?" | business_agent | Returns glossary definition |
| "Resuma os KPIs atuais" | dashboard_agent | Summarizes visible indicators |
| "Como a inadimplência evoluiu nos últimos 6 meses?" | comparison_agent | Returns trend analysis |
| "Qual a taxa Selic atual?" | external_agent | Returns BCB data or web search |
| "Gere um CSV dos contratos" | export_agent | Returns download link |
| "Se o LTV subir 10%, qual o impacto?" | simulation_agent | Returns simulation results |

- [ ] **Step 2: Test multi-agent chaining**

Prompt: "Compare a inadimplência da carteira com a Selic atual"
Expected: Orchestrator calls sql_agent first, then external_agent, then synthesizes.

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete multi-agent AI chat architecture

- Orchestrator routes to 7 specialized sub-agents
- SQL Agent with free-form BigQuery SELECT
- Business, Dashboard, Comparison, External, Export, Simulation agents
- Preliminary results with progressive step indicators
- Model registry with Gemini 2.5 family (Flash-Lite/Flash/Pro)
- New UI components: ToolStepIndicator, InlineDataRenderer, SqlPreview"
```
