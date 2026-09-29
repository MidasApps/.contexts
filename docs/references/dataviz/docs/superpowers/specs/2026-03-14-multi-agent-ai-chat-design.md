# Multi-Agent AI Chat Architecture — Design Spec

**Data:** 2026-03-14
**Status:** Draft
**Decisores:** Giuliano Soares

---

## 1. Problema

O chat AI atual (AISidebar) usa um único modelo Gemini 2.5 Flash com 7 tools agregadas. Quando o usuário faz perguntas que exigem dados granulares ("Quais contratos têm mais inadimplência?"), o agente não consegue responder porque suas tools só retornam dados agregados. Falta profundidade de acesso ao BigQuery, contexto de negócio especializado e capacidade de cruzar múltiplas fontes de dados.

## 2. Solução

Arquitetura multi-agente com:
- **Orquestrador** (streamText + Flash-Lite) que roteia perguntas para sub-agentes especialistas
- **7 sub-agentes** com modelos, tools e engenharia de contexto independentes
- **Preliminary results** via async generators para feedback progressivo ao usuário
- **SQL livre** contra o BigQuery com schema completo como contexto
- **Model registry** com `customProvider` do Vercel AI SDK para trocar providers sem mudar código

## 3. Decisões Arquiteturais

### 3.1 Execução: Server-side via API routes do Next.js

Todo processamento roda no backend (API route `/api/chat`). O frontend só envia a pergunta via `useChat` e renderiza o stream de respostas. Escolhido por compatibilidade total com o Vercel AI SDK v6 (`streamText`, `toUIMessageStreamResponse`, `useChat`).

Vertex AI Agent Builder (ADK) foi descartado por ser incompatível com `@ai-sdk/react` e criar vendor lock-in pesado.

### 3.2 Padrão: Orchestrator + Sub-Agent generateText com Preliminary Results

O orquestrador roda como `streamText`. Cada sub-agente é uma tool cujo `execute` é um async generator que:
1. Faz `yield` de status parciais (o frontend renderiza como step indicators)
2. Executa `generateText` internamente com modelo/tools/prompt próprios
3. Retorna resultado final ao orquestrador, que sintetiza a resposta

### 3.3 SQL: Acesso livre (SELECT) sem LIMIT forçado

O SQL Agent gera qualquer SELECT contra as tabelas do BigQuery, com o schema completo como contexto. Sem LIMIT forçado — resultados truncados geram análises incorretas em agregações. Proteções: timeout 60s, service account read-only, validação pré-execução (só SELECT).

### 3.4 Modelos: Gateway com aliases por complexidade

Usa `customProvider` do AI SDK com `@ai-sdk/google-vertex` (já instalado no projeto). Aliases semânticos abstraem o modelo concreto:

```typescript
import { customProvider } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';

export const models = customProvider({
  languageModels: {
    'router': vertex('gemini-2.5-flash-lite'),
    'fast': vertex('gemini-2.5-flash'),
    'reasoning': vertex('gemini-2.5-pro'),
  },
});
```

Gemini hoje. Para trocar provider no futuro (ex: Claude para SQL complexo), basta mudar o valor de `'reasoning'` para `anthropic('claude-sonnet-4.5')` sem alterar código dos agentes. Se múltiplos providers forem necessários simultaneamente, migrar para `@ai-sdk/gateway` com Vercel AI Gateway.

## 4. Arquitetura do Orquestrador

### 4.1 Fluxo

1. **Frontend** — `useChat` envia pergunta via POST `/api/chat` com body estruturado:
   ```typescript
   {
     messages: UIMessage[],
     dataset: string,           // ex: "om_monitor"
     filters: {
       dateRange: { start: string, end: string },  // "YYYY-MM-DD"
       projetos: string[],                          // ex: ["VIVA PARK"]
       advancedFilters: {
         ratings: string[],        // ex: ["A", "B"]
         elegibilidade: string[],
         faixaLtv: string[],
         faixaAtraso: string[],
         tipoProponente: string[],
         gruposRepasse: string[],
       },
       compareEnabled: boolean,
       comparePeriod?: { start: string, end: string },
     },
     page: string,              // ex: "/dashboard"
   }
   ```
   O campo `context` (string do `buildAIContext()`) é removido — o servidor constrói o contexto a partir dos filters estruturados, eliminando risco de dados duplicados
2. **API Route** — Valida auth Firebase, extrai contexto do body
3. **Orchestrator** — `streamText` com modelo `router` (Flash-Lite) analisa a pergunta e chama o sub-agente correto via tool call
4. **Sub-Agent** — Async generator faz yield de status parciais → executa `generateText` com modelo/tools/prompt isolados → retorna resultado
5. **Orchestrator** — Recebe tool result, sintetiza resposta final. Pode encadear múltiplos agentes (até 10 steps)
6. **Frontend** — Stream renderiza resposta + step indicators em tempo real

### 4.2 System Prompt do Orquestrador

Enxuto — descreve cada agente em 1-2 linhas com regras de roteamento. Não inclui contexto de negócio (isso fica nos sub-agentes).

### 4.3 Roteamento

| Tipo de Pergunta | Agente | Exemplo |
|---|---|---|
| Consulta específica / dados brutos | `sql_agent` | "Quais contratos têm mais de 90 dias de atraso?" |
| Explicação de conceito / regra | `business_agent` | "O que significa PDD Liquid vs Bacen?" |
| O que estou vendo no dashboard | `dashboard_agent` | "Resuma os KPIs atuais" |
| Variação / tendência / anomalia | `comparison_agent` | "Como a inadimplência evoluiu nos últimos 6 meses?" |
| Dados econômicos / mercado | `external_agent` | "Qual a taxa Selic atual?" |
| Gerar relatório / exportar | `export_agent` | "Gere um PDF da carteira atual" |
| Cenário hipotético / what-if | `simulation_agent` | "Se o LTV subir 10%, qual o impacto na elegibilidade?" |

### 4.4 Multi-Agent Chaining

O orquestrador pode chamar múltiplos agentes em sequência dentro dos 10 steps. Ex: "Compare inadimplência com a Selic" → `sql_agent` (busca inadimplência) → `external_agent` (busca Selic) → síntese final.

## 5. Sub-Agentes Especialistas

### 5.1 SQL Agent

- **Modelo:** Gemini 2.5 Pro ($1.25/1M input)
- **Razão:** SQL complexo exige raciocínio forte
- **System prompt:** Schema completo das 3 tabelas (~35 campos), valores categóricos, fórmulas derivadas, regras SQL, contexto dinâmico (dataset, filters)
- **Tools:**
  - `execute_sql(query)` → Executa SELECT no BigQuery. Read-only, timeout 60s
  - `get_table_schema(table)` → Schema detalhado para queries complexas
  - `get_sample_data(table, n)` → N rows de amostra
- **Multi-step interno:** Até 3 steps (gera SQL → executa → corrige se falhar)
- **Guardrails:** Só SELECT permitido (validação pré-execução), service account BigQuery Data Viewer, timeout 60s, erro legível retornado ao orquestrador

### 5.2 Business Agent

- **Modelo:** Gemini 2.5 Flash ($0.15/1M input)
- **Razão:** Contexto no prompt basta, baixa complexidade
- **System prompt:** Glossário completo (~30 termos), escala de ratings Liquid (A=900-1000 a H=0-299), regras de negócio de securitização, critérios de elegibilidade, fórmulas de cálculo (PDD, pricing, deságio), contexto regulatório (Bacen, CVM)
- **Tools:**
  - `lookup_glossary(term)` → Definição com contexto e fórmula
  - `get_business_rule(topic)` → Regra de negócio detalhada
  - `get_indicator_definition(kpi)` → Definição, fórmula e interpretação

### 5.3 Dashboard Agent

- **Modelo:** Gemini 2.5 Flash-Lite ($0.075/1M input)
- **Razão:** Lê e resume, não raciocina
- **System prompt:** Instruções de interpretação de KPIs, tendências, alertas. Recebe `buildAIContext()` completo (indicadores, charts, filtros, página atual) direto no system prompt
- **Tools:**
  - `read_dashboard_state()` → Snapshot completo dos indicadores visíveis
  - `read_active_filters()` → Filtros ativos com valores legíveis
- **Execução:** Usa `generateText` como todos os outros agentes, mas com modelo Flash-Lite e sem multi-step (stopWhen: stepCountIs(1)). O contexto rico no system prompt é suficiente para a maioria das respostas; as tools servem como fallback para refresh de dados

### 5.4 Comparison Agent

- **Modelo:** Gemini 2.5 Pro ($1.25/1M input)
- **Razão:** Análise estatística e identificação de tendências
- **System prompt:** Metodologia de comparação (MoM, YoY, range vs range), polaridades de métricas (positiveIsGood), benchmarks do mercado imobiliário
- **Tools:**
  - `compare_periods(table, p1, p2, metric)` → Variação entre períodos
  - `get_kpi_history(metric, months)` → Série temporal para análise de tendência
  - `detect_anomalies(metric, threshold)` → Pontos fora do padrão

### 5.5 External Data Agent

- **Modelo:** Gemini 2.5 Flash ($0.15/1M input)
- **Razão:** Search + síntese, complexidade média
- **System prompt:** Indicadores econômicos relevantes para securitização, fontes confiáveis (BCB, IBGE, B3, CVM), correlações conhecidas (Selic x inadimplência, IPCA x correção), tabela de códigos SGS do Banco Central
- **Tools:**
  - `search_web(query)` → Firecrawl com filtro de fontes confiáveis
  - `get_bcb_indicator(code, period)` → API REST do Banco Central (endpoint: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados`). Sem autenticação. Códigos principais: Selic meta=432, Selic over=1178, IPCA=433, IGPM=189, CDI=4389, câmbio USD=1. Retorna JSON com `[{data, valor}]`

### 5.6 Export Agent

- **Modelo:** Gemini 2.5 Flash-Lite ($0.075/1M input)
- **Razão:** Template-based, baixa complexidade
- **System prompt:** Templates de relatório, formato padrão, regras de formatação (BRL, pt-BR, decimais)
- **Tools:**
  - `generate_pdf(sections, filters)` → Gera PDF server-side com jsPDF (sem html2canvas — construção programática de tabelas/textos via jsPDF API direta). Salva em `/tmp` e retorna URL para download via API route dedicada
  - `generate_csv(query_result, columns)` → CSV builder server-side. Mesmo padrão de URL temporária
- **Nota:** Não usa html2canvas (requer DOM de browser). PDFs são construídos programaticamente com jsPDF: `doc.text()`, `doc.autoTable()` (via jspdf-autotable), `doc.setFont()`. Sem renderização de gráficos no PDF — foco em dados tabulares e KPIs

### 5.7 Simulation Agent

- **Modelo:** Gemini 2.5 Pro ($1.25/1M input)
- **Razão:** Cenários complexos com fórmulas financeiras
- **System prompt:** Modelos de simulação disponíveis, parâmetros default e ranges aceitáveis, fórmulas de cálculo, cenários históricos de referência, instrução para sempre explicitar premissas assumidas
- **Tipos de simulação:**
  - `ltv_stress` — Simula impacto de variação no valor dos imóveis sobre LTV e elegibilidade. Params: `percentual_variacao` (float, ex: -0.10 para queda de 10%)
  - `pdd_scenario` — Recalcula PDD sob diferentes premissas de inadimplência. Params: `inadimplencia_alvo` (float, ex: 0.05 para 5%)
  - `pricing_sensitivity` — Simula impacto de variação na taxa de desconto sobre o pricing. Params: `spread_bps` (integer, ex: 50 para +50bps)
  - `elegibilidade_filter` — Simula impacto de mudanças nos critérios de elegibilidade. Params: `max_ltv` (float), `max_dias_atraso` (int), `min_rating` (string A-H)
- **Tools:**
  - `run_simulation(scenario, params)` → Busca dados base via SQL, aplica transformação conforme cenário, retorna baseline vs simulado com variação percentual. `scenario` é um dos tipos acima, `params` segue o schema do tipo
  - `get_baseline(metric)` → Valores atuais como baseline para comparação
  - `execute_sql(query)` → Acesso ao BigQuery para dados base da simulação

## 6. Engenharia de Contexto

### 6.1 Padrão de Injeção

1. **Arquivos estáticos** — Cada agente tem um arquivo em `src/shared/config/agents/` exportando seu contexto como string template (schema, glossário, regras)
2. **Factory function** — `buildAgentPrompt(agentId, dynamicContext)` combina contexto estático + dados dinâmicos do request
3. **Closure scope** — O orquestrador cria as tools via `createAgentTool()` dentro do handler do request, capturando `dataset`, `filters` e `dashboardState` por closure. Cada tool acessa esses valores diretamente no seu `execute`, sem dependência de `experimental_context`
4. **`generateText`** — Sub-agente monta sua chamada com `system: buildAgentPrompt(agentId, { dataset, filters })` e `tools: agentTools`

### 6.2 Contexto Estático por Agente

| Agente | Conteúdo estático | Conteúdo dinâmico | ~Tokens |
|---|---|---|---|
| SQL Agent | Schema (3 tabelas, ~35 campos), fórmulas, valores categóricos, regras SQL | dataset, dateRange, projetos, advancedFilters | ~3.000 |
| Business Agent | Glossário (~30 termos), ratings, regras Bacen, fórmulas | Nenhum | ~2.000 |
| Dashboard Agent | Instruções de interpretação | buildAIContext() completo | ~4.000-8.000 |
| Comparison Agent | Metodologia, polaridades, benchmarks | dataset, dateRange, comparePeriod | ~1.500 |
| External Agent | Indicadores relevantes, fontes, correlações | Nenhum | ~1.000 |
| Export Agent | Templates, formatação BRL/pt-BR | buildAIContext() | ~1.500 |
| Simulation Agent | Modelos, fórmulas, parâmetros, ranges | dataset, dateRange, projetos | ~2.500 |

### 6.3 Schema do SQL Agent

O contexto inclui as 3 tabelas documentadas campo a campo:

**Tabela `contratos`** (~30 campos):
- Identificação: `id_contrato`, `projeto`, `data_base_report`, `documento`, `nome_cliente`, `proponent_type`, `unidade`, `data_emissao`, `safra`
- Financeiro: `saldo_devedor`, `saldo_nominal`, `valor_imovel`, `pricing`, `correcao_monetaria`
- Risco: `rating_liquid` (A-H), `elegibilidade`, `ltv`, `faixa_ltv`, `dias_atraso`, `faixa_atraso`, `valor_atraso`, `valor_over_90`
- PDD: `pdd_minimo_bacen`, `pdd_liquid`, `delta_pdd`
- Prazo: `prazo_decorrido`, `prazo_remanescente`
- Repasse: `restricoes`, `grupos_repasse`, `renda_suficiente`, `limite_simulacao`, `private_area`

**Tabela `pagamentos`** (~5 campos):
- `data_base_report`, `projeto`, `tipo_recebimento`, `valor_pago`
- tipo_recebimento: "Pagamento antecipado", "Vencimento na referência", "Recuperação mês anterior", "Recuperação anterior"

**Tabela `fluxo_caixa`** (~5 campos):
- `data_base_fluxo`, `data_base_report`, `projeto`, `fluxo_esperado`, `fluxo_contratado`

**Fórmulas derivadas:**
- `inadimplencia_pct = SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100`
- `ltv_medio = AVG(ltv)`
- `over_90_pct = SAFE_DIVIDE(COUNTIF(dias_atraso > 90), COUNT(DISTINCT id_contrato))`
- `desagio = SAFE_DIVIDE(SUM(pricing) - SUM(saldo_nominal), SUM(saldo_nominal)) * 100`
- `pct_contratos = SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER()) * 100`

### 6.4 Guardrails do SQL Agent

- **Pré-execução:** Rejeita qualquer statement que não seja SELECT. Valida que tabela existe no dataset
- **Runtime:** Timeout 60s. Service account com role BigQuery Data Viewer (read-only)
- **Error recovery:** Se SQL falha, sub-agente pode usar `get_table_schema` + retry (multi-step interno de até 3 steps)
- **Sem LIMIT forçado:** Resultados truncados geram análises incorretas em agregações sobre a carteira inteira

## 7. UX do Frontend

### 7.1 Preliminary Results → UI

Cada `yield` do async generator aparece como um step indicator no chat:

| yield status | Ícone | Label | Extra |
|---|---|---|---|
| `routing` | Sparkles | "Roteando para {agent}" | Nome do agente |
| `analyzing` | Brain | "Analisando pergunta" | — |
| `generating_sql` | Pencil | "Gerando SQL" | — |
| `executing_sql` | Database | "Executando query" | SQL truncado em monospace |
| `query_complete` | Check | "Query executada" | Row count + tempo |
| `searching` | Search | "Buscando dados econômicos" | Query de busca |
| `comparing` | Chart | "Comparando períodos" | Períodos |
| `simulating` | Flask | "Rodando simulação" | Cenário e parâmetros |
| `exporting` | Download | "Gerando relatório" | Formato |
| `error` | Warning | "Erro: {message}" | Mensagem legível |

### 7.2 Tipos de Resultado Rico

- **Tabela inline** — Rows tabulares no chat (até 10 rows, expandível)
- **KPI highlight** — Valor destacado com variação (ex: "Inadimplência: 0,49% ↓ 0,12pp")
- **Download link** — Para PDFs/CSVs gerados pelo Export Agent
- **SQL collapsible** — Query executada com syntax highlight, expandível, click-to-copy

### 7.3 Novos Componentes

- `ToolStepIndicator` — Timeline de steps do agente (ícone, label, tempo, estado loading/done/error)
- `InlineDataRenderer` — Renderiza dados estruturados inline (tabelas, KPIs, downloads)
- `SqlPreview` — SQL expandível com syntax highlight

### 7.4 Modificações em Componentes Existentes

- `AISidebar.tsx` — Novo rendering de tool parts com preliminary results
- `TOOL_LABELS` — Expandido para 7 agentes + status parciais
- `SUGGESTIONS_BY_PAGE` — Novas sugestões cobrindo todos os agentes

## 8. Estrutura de Arquivos

```
src/
  shared/
    config/
      agents/                        ← NOVO: contexto estático
        index.ts                     — re-export
        types.ts                     — AgentId, AgentConfig, PreliminaryResult
        orchestrator.ts              — system prompt + routing rules
        sql-agent.ts                 — schema, fórmulas, regras SQL
        business-agent.ts            — glossário, regras de negócio
        dashboard-agent.ts           — instruções de interpretação
        comparison-agent.ts          — metodologia, benchmarks
        external-agent.ts            — fontes, indicadores econômicos
        export-agent.ts              — templates, formatação
        simulation-agent.ts          — modelos, fórmulas, ranges

  features/
    ai-agents/                       ← NOVO: lógica de execução
      orchestrator.ts                — streamText + tools de roteamento
      create-agent-tool.ts           — factory: tool com async generator
      agents/
        sql-agent.ts                 — generateText + execute_sql
        business-agent.ts            — generateText + glossary tools
        dashboard-agent.ts           — generateText (Flash-Lite) + dashboard context
        comparison-agent.ts          — generateText + compare tools
        external-agent.ts            — generateText + search/bcb tools
        export-agent.ts              — pdf/csv generation
        simulation-agent.ts          — generateText + simulation tools
      tools/
        execute-sql.ts               — BigQuery execution + guardrails
        get-table-schema.ts          — schema introspection
        search-web.ts                — Firecrawl wrapper
        get-bcb-indicator.ts         — Banco Central API
        generate-pdf.ts              — jsPDF wrapper
        generate-csv.ts              — CSV builder
      model-registry.ts              — gateway config + model aliases

  widgets/
    ai-sidebar/
      ui/
        AISidebar.tsx                — MODIFICADO: novo rendering
        ToolStepIndicator.tsx        — NOVO: timeline de steps
        InlineDataRenderer.tsx       — NOVO: tabelas, KPIs, downloads
        SqlPreview.tsx               — NOVO: SQL expandível

app/
  api/
    chat/route.ts                    — REESCRITO: usa orchestrator
```

### 8.1 Separação de Responsabilidades

| Camada | Pasta | Quem edita | Quando muda |
|---|---|---|---|
| Config | `shared/config/agents/` | Product/domain experts | Regras de negócio mudam |
| Features | `features/ai-agents/` | Devs | Novos agentes ou tools |
| Widgets | `widgets/ai-sidebar/ui/` | Frontend devs | UX muda |

## 9. Error Handling

Contrato consistente: todo sub-agente retorna `{ status: 'done' | 'error', text?, error? }`. O orquestrador recebe erro legível e pode tentar outro agente ou informar o usuário.

| Agente | Erros possíveis | Tratamento |
|---|---|---|
| SQL Agent | SQL inválido, timeout BigQuery, tabela não encontrada | Retry com `get_table_schema` (até 3 steps). Se persistir, retorna erro com SQL tentado |
| Business Agent | Termo não encontrado no glossário | Retorna resposta genérica baseada no system prompt |
| Dashboard Agent | `buildAIContext()` vazio (sem indicadores) | Retorna mensagem pedindo para navegar a uma página com dados |
| Comparison Agent | Período sem dados, métrica inexistente | Retorna erro com períodos/métricas disponíveis |
| External Agent | Firecrawl indisponível, BCB API timeout | Fallback: search_web se BCB falhar, mensagem de indisponibilidade se ambos falharem |
| Export Agent | Erro na geração do PDF/CSV | Retorna erro com detalhes, sem retry |
| Simulation Agent | Parâmetros fora do range, dados insuficientes | Retorna erro com ranges aceitáveis |

## 10. Stack Técnica

- **AI SDK:** Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, `@ai-sdk/google-vertex`)
- **Modelos:** Gemini 2.5 Flash-Lite (router), Flash (medium), Pro (reasoning) via `customProvider` com aliases
- **BigQuery:** `@google-cloud/bigquery` — queries ad-hoc read-only
- **Auth:** Firebase Admin — verificação de token + controle de acesso por dataset
- **Web search:** Firecrawl (`@mendable/firecrawl-js`)
- **Export:** jsPDF + jspdf-autotable (PDF, server-side programático), custom builder (CSV). `jspdf-autotable` é dependência nova a instalar
- **Frontend:** React 19 + `useChat` + streaming + preliminary tool results

## 11. Notas de Implementação

- **Sub-agentes são stateless** — cada chamada é single-turn (sem histórico de conversa). O orquestrador mantém o histórico via `useChat` messages
- **Conversation history** — `useChat` envia o histórico completo ao orquestrador. Sub-agentes recebem apenas a pergunta atual (extraída pelo orquestrador no tool call)
- **`createAgentTool` factory** — Recebe `AgentConfig` e retorna `tool()` com async generator. Todos os agentes usam `generateText` internamente (incluindo Dashboard Agent). A factory é a única abstração de orquestração — sem framework adicional
