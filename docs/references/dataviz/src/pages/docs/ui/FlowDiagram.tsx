'use client';

import { cn } from '@/shared/lib/utils';

/**
 * Interactive flowchart showing a complete user simulation:
 * User message → API → Orchestrator reasoning → tool calls → sub-agents → UI render
 */

interface FlowStepProps {
  number: number;
  title: string;
  actor: string;
  actorColor: string;
  children: React.ReactNode;
  connector?: boolean;
  bqml?: boolean;
}

function FlowStep({ number, title, actor, actorColor, children, connector = true, bqml }: FlowStepProps) {
  return (
    <>
      <div className="relative flex gap-4">
        {/* Timeline line */}
        <div className="flex flex-col items-center shrink-0">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold border-2',
            actorColor,
          )}>
            {number}
          </div>
          {connector && <div className="w-px flex-1 bg-muted/70 min-h-[16px]" />}
        </div>

        {/* Content */}
        <div className="flex-1 pb-6 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[13px] font-semibold text-foreground">{title}</span>
            <span className={cn('rounded-md px-2 py-0.5 text-[9px] font-medium', actorColor)}>{actor}</span>
            {bqml && (
              <span className="rounded-md bg-purple-500/15 px-2 py-0.5 text-[9px] font-medium text-purple-400 border border-purple-500/20">
                BQML
              </span>
            )}
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="text-[11px] text-muted-foreground font-mono bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-[1.7] mt-2">
      {children}
    </pre>
  );
}

function ToolCall({ name, color, description }: { name: string; color: string; description: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={cn('rounded-md border bg-black/30 px-2 py-0.5 text-[10px] font-mono shrink-0', color)}>
        {name}
      </span>
      <span className="text-[11px] text-muted-foreground/80 leading-relaxed">{description}</span>
    </div>
  );
}

export function FlowDiagram() {
  return (
    <div className="py-8 px-4 max-w-3xl mx-auto">
      <h2 className="text-lg font-bold text-foreground tracking-tight text-center">Fluxo Completo: Simulacao de Uso</h2>
      <p className="text-xs text-muted-foreground/80 text-center mb-2">
        Exemplo: &quot;Quero analisar o risco de repasse da minha carteira&quot;
      </p>
      <p className="text-[10px] text-purple-400/60 text-center mb-8">
        Passos marcados com <span className="rounded bg-purple-500/15 px-1 py-0.5 text-purple-400">BQML</span> so ocorrem quando &quot;Analise Profunda&quot; esta ativada
      </p>

      {/* Step 1: User sends message */}
      <FlowStep number={1} title="Usuario envia mensagem" actor="Frontend" actorColor="text-muted-foreground border-border bg-muted/40">
        <p className="text-[11px] text-foreground/55 leading-relaxed">
          O usuario digita no chat do <code className="text-primary bg-muted/40 px-1 rounded text-[10px]">/explore</code> e clica enviar.
          O <code className="text-primary bg-muted/40 px-1 rounded text-[10px]">ChatPanel</code> monta o body com contexto:
        </p>
        <CodeBlock>{`// ConversationSidebar.tsx → buildBody()
{
  messages: UIMessage[],        // historico da conversa
  dataset: "projeto.dataset",   // BigQuery dataset ativo
  filters: {
    dateRange: { start, end },  // periodo selecionado
    projetos: [...],            // filtros ativos
    viewMode: "snapshot",       // ou "accumulated"
    compareEnabled: false
  },
  pagesContext: [...],          // estado atual das paginas
  bqmlEnabled: false,           // toggle "Analise Profunda"
  selectedBlockIds: []          // blocos selecionados pelo usuario
}`}</CodeBlock>
      </FlowStep>

      {/* Step 2: API receives */}
      <FlowStep number={2} title="API recebe e autentica" actor="Server" actorColor="text-blue-400 border-blue-500/30 bg-blue-500/[0.06]">
        <p className="text-[11px] text-foreground/55 leading-relaxed">
          <code className="text-blue-400 bg-muted/40 px-1 rounded text-[10px]">POST /api/canvas-chat</code> verifica Firebase auth token e acesso ao dataset.
          Depois chama <code className="text-primary bg-muted/40 px-1 rounded text-[10px]">createCanvasOrchestrator()</code>.
        </p>
        <CodeBlock>{`// app/api/canvas-chat/route.ts
const token = headers.get('Authorization');
await verifyAuthToken(token);      // Firebase Admin
await verifyDatasetAccess(email);   // checagem de permissao

const result = await createCanvasOrchestrator({
  messages, dataset, filters,
  pagesContext, bqmlEnabled, selectedBlockIds
});
return result.toUIMessageStreamResponse(); // SSE stream`}</CodeBlock>
      </FlowStep>

      {/* Step 3: Orchestrator builds prompt */}
      <FlowStep number={3} title="Orchestrator monta system prompt" actor="Orchestrator" actorColor="text-primary border-primary/30 bg-primary/[0.06]">
        <p className="text-[11px] text-foreground/55 leading-relaxed">
          O orchestrator constroi o system prompt injetando contexto dinamico:
        </p>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
            <span className="text-muted-foreground">Regras de construcao (storytelling, grid 3 colunas, KPIs com sparkline)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
            <span className="text-muted-foreground">Dataset e filtros ativos (periodo, projetos, viewMode)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
            <span className="text-muted-foreground">Estado atual das paginas (blocos existentes, IDs)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-purple-400/40 shrink-0" />
            <span className="text-purple-400/70">Se bqmlEnabled: injeta secao BigQuery ML (CREATE MODEL, ML.PREDICT, etc.)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
            <span className="text-muted-foreground">Se selectedBlockIds: injeta regra de edicao focada</span>
          </div>
        </div>
        <CodeBlock>{`// orchestrator.ts
streamText({
  model: getModel('reasoning'),     // modelo mais capaz
  system: buildCanvasOrchestratorPrompt(ctx),
  messages: convertToModelMessages(input.messages),
  tools: { /* 18 tools registradas */ },
  stopWhen: stepCountIs(30),        // max 30 chamadas de tool
})`}</CodeBlock>
      </FlowStep>

      {/* Step 4: Plan analysis */}
      <FlowStep number={4} title="Agente planeja a analise" actor="LLM" actorColor="text-primary border-primary/30 bg-primary/[0.06]">
        <p className="text-[11px] text-foreground/55 leading-relaxed mb-2">
          O LLM raciocina e chama <code className="text-emerald-400 bg-muted/40 px-1 rounded text-[10px]">plan_analysis</code> como primeira tool:
        </p>
        <ToolCall name="plan_analysis" color="text-emerald-400 border-emerald-500/20" description="Estrutura: 1 pagina 'Risco de Repasse' com KPIs de elegibilidade, grafico de distribuicao por faixa LTV, tabela de contratos criticos" />
        <CodeBlock>{`{
  userRequest: "analisar risco de repasse",
  plan: {
    pages: [{
      title: "Risco de Repasse",
      description: "Analise de elegibilidade e perfil de risco",
      blocks: [
        { type: "text", description: "Contexto da analise" },
        { type: "kpis", description: "LTV medio, elegibilidade, saldo" },
        { type: "chart", description: "Distribuicao por faixa LTV",
          queryHint: "GROUP BY faixa_ltv" },
        { type: "table", description: "Top contratos por LTV" }
      ]
    }]
  }
}`}</CodeBlock>
      </FlowStep>

      {/* Step 5: Schema exploration */}
      <FlowStep number={5} title="Explora schema antes de SQL" actor="LLM" actorColor="text-primary border-primary/30 bg-primary/[0.06]">
        <p className="text-[11px] text-foreground/55 leading-relaxed mb-2">
          Antes de escrever queries, o agente consulta o schema:
        </p>
        <ToolCall name="get_table_schema" color="text-emerald-400 border-emerald-500/20" description='table: "contratos" → retorna 35+ colunas com tipos e descricoes' />
        <ToolCall name="get_sample_data" color="text-emerald-400 border-emerald-500/20" description='table: "contratos", n: 3 → amostra de dados para entender formato' />
      </FlowStep>

      {/* Step 6: Create page + query */}
      <FlowStep number={6} title="Cria pagina e consulta dados" actor="LLM" actorColor="text-primary border-primary/30 bg-primary/[0.06]">
        <p className="text-[11px] text-foreground/55 leading-relaxed mb-2">
          Cria a pagina e executa queries para obter os dados:
        </p>
        <ToolCall name="create_page" color="text-blue-400 border-blue-500/20" description='title: "Risco de Repasse", description: "..." → retorna pageIndex: 0' />
        <ToolCall name="query_data" color="text-emerald-400 border-emerald-500/20" description="SQL: SELECT com metricas agregadas (LTV medio, elegibilidade%, saldo) agrupado por mes para sparkline (10 meses)" />
        <ToolCall name="query_data" color="text-emerald-400 border-emerald-500/20" description="SQL: SELECT com distribuicao por faixa_ltv (quantidade e saldo por faixa)" />

        <div className="mt-3 rounded-lg border border-border bg-black/20 p-3">
          <div className="text-[10px] font-bold text-muted-foreground/80 mb-1">O que query_data faz internamente:</div>
          <div className="text-[10px] text-muted-foreground/80 space-y-0.5">
            <div>1. Valida SQL (bloqueia INSERT/DELETE/DROP)</div>
            <div>2. Executa no BigQuery (timeout 60s)</div>
            <div>3. Trunca a 500 rows para o LLM</div>
            <div>4. Retorna dados + metadados</div>
          </div>
        </div>
      </FlowStep>

      {/* Step 7: Build blocks */}
      <FlowStep number={7} title="Constroi blocos visuais" actor="LLM" actorColor="text-primary border-primary/30 bg-primary/[0.06]">
        <p className="text-[11px] text-foreground/55 leading-relaxed mb-2">
          Com os dados em maos, o agente cria os blocos na pagina:
        </p>
        <ToolCall name="add_text_block" color="text-blue-400 border-blue-500/20" description='pageIndex: 0, colSpan: 3, content: "## Risco de Repasse\nAnalise da elegibilidade..."' />
        <ToolCall name="add_kpi_block" color="text-blue-400 border-blue-500/20" description='pageIndex: 0, label: "LTV Medio", value: "84,19%", sparklineData: [83.2, 83.5, ...], sparklineMonths: ["2025-04", ...]' />
        <ToolCall name="add_kpi_block" color="text-blue-400 border-blue-500/20" description='pageIndex: 0, label: "Elegibilidade", value: "72,3%", trend: "-1,2%", trendIsPositive: false' />
        <ToolCall name="add_kpi_block" color="text-blue-400 border-blue-500/20" description='pageIndex: 0, label: "Saldo Devedor", value: "R$ 108 mi", trend: "+2,7%"' />
        <ToolCall name="add_chart_block" color="text-blue-400 border-blue-500/20" description='pageIndex: 0, chartType: "composed", xAxisKey: "faixa_ltv", dataKeys: ["quantidade_contratos", "saldo_devedor_total"], colSpan: 3' />

        <div className="mt-3 rounded-lg border border-border bg-black/20 p-3">
          <div className="text-[10px] font-bold text-muted-foreground/80 mb-1">O que acontece no frontend (por tool call):</div>
          <div className="text-[10px] text-muted-foreground/80 space-y-0.5">
            <div>1. ChatPanel recebe tool result via SSE stream</div>
            <div>2. useEffect processa: canvasStore.addBlock(pageIndex, block)</div>
            <div>3. CanvasPanel re-renderiza com o novo bloco</div>
            <div>4. Debounced save → Firestore (1.5s)</div>
          </div>
        </div>
      </FlowStep>

      {/* Step 8: Deep analysis (optional) */}
      <FlowStep number={8} title="Delegacao a sub-agente (se necessario)" actor="Sub-Agent" actorColor="text-red-400 border-red-400/30 bg-red-400/[0.06]">
        <p className="text-[11px] text-foreground/55 leading-relaxed mb-2">
          Se a analise requer expertise especifica, o orchestrator delega:
        </p>
        <ToolCall name="analyze" color="text-red-400 border-red-400/20" description='agentType: "diagnostic", query: "Por que a elegibilidade caiu nos ultimos 3 meses?"' />

        <div className="mt-3 rounded-lg border border-red-400/10 bg-red-400/[0.02] p-3 space-y-2">
          <div className="text-[10px] font-bold text-red-400/60">Dentro do sub-agente (Diagnostico):</div>
          <div className="text-[10px] text-muted-foreground/80 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-purple-400 bg-purple-500/10 rounded px-1">modelo: fast</span>
              <span className="text-[9px] text-muted-foreground/60 bg-muted/40 rounded px-1">max 8 steps</span>
            </div>
            <div>1. Recebe system prompt do diagnostic-agent + contexto compartilhado</div>
            <div>2. Tem 3 tools: execute_sql, get_table_schema, get_sample_data</div>
            <div>3. Executa queries de decomposicao (HHI, correlacao, segmentacao)</div>
            <div>4. Retorna texto analitico ao orchestrator</div>
          </div>
        </div>
      </FlowStep>

      {/* Step 8b: BQML flow */}
      <FlowStep number={9} title="BigQuery ML (quando ativado)" actor="Sub-Agent" actorColor="text-purple-400 border-purple-500/30 bg-purple-500/[0.06]" bqml>
        <p className="text-[11px] text-foreground/55 leading-relaxed mb-2">
          Com &quot;Analise Profunda&quot; ativa, sub-agentes podem usar ML:
        </p>

        <div className="space-y-3">
          {/* Predictive example */}
          <div className="rounded-lg border border-purple-500/10 bg-purple-500/[0.02] p-3">
            <div className="text-[11px] font-semibold text-purple-400 mb-1">Preditivo: &quot;Projete a inadimplencia para 6 meses&quot;</div>
            <div className="text-[10px] text-muted-foreground/80 space-y-0.5">
              <div>1. Orchestrator chama <code className="text-red-400">analyze(agentType: &quot;predictive&quot;, query: ...)</code></div>
              <div>2. Predictive agent executa via <code className="text-emerald-400">execute_sql</code>:</div>
            </div>
            <CodeBlock>{`CREATE OR REPLACE MODEL \`dataset.ml_models.inadimplencia_forecast\`
OPTIONS(model_type='ARIMA_PLUS', time_series_data_col='valor',
        time_series_timestamp_col='mes') AS
SELECT DATE_TRUNC(data_base_report, MONTH) as mes,
       SUM(valor_atraso) as valor
FROM \`dataset.contratos\`
GROUP BY 1;

-- Depois:
SELECT * FROM ML.FORECAST(
  MODEL \`dataset.ml_models.inadimplencia_forecast\`,
  STRUCT(6 AS horizon, 0.95 AS confidence_level)
);`}</CodeBlock>
          </div>

          {/* Simulation example */}
          <div className="rounded-lg border border-purple-500/10 bg-purple-500/[0.02] p-3">
            <div className="text-[11px] font-semibold text-purple-400 mb-1">Simulacao: &quot;Stress test com 20% de desvalorizacao&quot;</div>
            <div className="text-[10px] text-muted-foreground/80 space-y-0.5">
              <div>1. Orchestrator chama <code className="text-red-400">analyze(agentType: &quot;simulation&quot;, query: ...)</code></div>
              <div>2. Simulation agent usa LOGISTIC_REG para ECL sob stress:</div>
            </div>
            <CodeBlock>{`-- Treina modelo de PD
CREATE OR REPLACE MODEL \`dataset.ml_models.pd_stress\`
OPTIONS(model_type='LOGISTIC_REG', input_label_cols=['default_flag'])
AS SELECT ltv * 1.20 as ltv,  -- stress: +20% LTV
          dias_atraso, taxa_juros, ...
FROM \`dataset.contratos\`;

-- Aplica predicao
SELECT * FROM ML.PREDICT(
  MODEL \`dataset.ml_models.pd_stress\`,
  (SELECT * FROM \`dataset.contratos\`)
);`}</CodeBlock>
          </div>

          {/* Which agents use BQML */}
          <div className="rounded-lg border border-border bg-black/20 p-3">
            <div className="text-[10px] font-bold text-muted-foreground/80 mb-2">Agentes que usam BQML:</div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-400">
                Preditivo — ARIMA_PLUS, LOGISTIC_REG, BOOSTED_TREE
              </span>
              <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-400">
                Simulacao — ARIMA_PLUS, LINEAR_REG, LOGISTIC_REG
              </span>
              <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-400">
                Prescritivo — KMEANS, LINEAR_REG
              </span>
              <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-400">
                Monitoramento — ML.DETECT_ANOMALIES
              </span>
            </div>
          </div>
        </div>
      </FlowStep>

      {/* Step 10: Response */}
      <FlowStep number={10} title="Resposta final ao usuario" actor="LLM → Frontend" actorColor="text-primary border-primary/30 bg-primary/[0.06]" connector={false}>
        <p className="text-[11px] text-foreground/55 leading-relaxed mb-2">
          O orchestrator envia texto final explicando a analise. O frontend ja renderizou os blocos em tempo real via SSE:
        </p>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400/40 shrink-0" />
            <span className="text-muted-foreground">Pagina &quot;Risco de Repasse&quot; criada com titulo e descricao</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-400/40 shrink-0" />
            <span className="text-muted-foreground">3 KPIs com sparkline (LTV, Elegibilidade, Saldo)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-400/40 shrink-0" />
            <span className="text-muted-foreground">Grafico composed (barras + linha) por faixa LTV</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-400/40 shrink-0" />
            <span className="text-muted-foreground">Tabela com top contratos por LTV</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
            <span className="text-muted-foreground">Texto narrativo no chat: &quot;A primeira parte da sua analise esta pronta...&quot;</span>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-black/20 p-3">
          <div className="text-[10px] font-bold text-muted-foreground/80 mb-1">Auto-save:</div>
          <div className="text-[10px] text-muted-foreground/80">
            Messages + canvas pages salvos no Firestore via debouncedSave (1.5s).
            Ao reabrir a conversa, tudo e restaurado.
          </div>
        </div>
      </FlowStep>
    </div>
  );
}
