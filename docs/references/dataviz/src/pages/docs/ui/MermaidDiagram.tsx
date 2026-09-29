'use client';

import { useEffect, useState, useRef } from 'react';

const DIAGRAM = `flowchart TD
    classDef user fill:#1a1a2e,stroke:#555,color:#ccc
    classDef api fill:#1a1a2e,stroke:#7AA2F7,color:#7AA2F7
    classDef orch fill:#1a1a2e,stroke:#F3A169,color:#F3A169
    classDef tool fill:#0d1117,stroke:#6ECB8A,color:#6ECB8A
    classDef block fill:#0d1117,stroke:#7AA2F7,color:#7AA2F7
    classDef decision fill:#1a1a2e,stroke:#F3A169,color:#F3A169
    classDef subagent fill:#1a1a2e,stroke:#F27C7C,color:#F27C7C
    classDef bqml fill:#1a1a2e,stroke:#a855f7,color:#a855f7
    classDef context fill:#0d1117,stroke:#555,color:#888
    classDef frontend fill:#1a1a2e,stroke:#6ECB8A,color:#6ECB8A

    U["👤 Usuario digita no /explore"]:::user
    TOGGLE{"🧠 Analise Profunda ativada?"}:::decision
    BODY["Monta request body<br/><i>messages, dataset, filters,<br/>pagesContext, bqmlEnabled</i>"]:::api
    API["POST /api/canvas-chat"]:::api
    AUTH{"Auth Firebase OK?"}:::decision
    AUTH_FAIL["❌ 401 Unauthorized"]:::user
    ACCESS{"Acesso ao dataset?"}:::decision
    ACCESS_FAIL["❌ 403 Forbidden"]:::user

    U --> TOGGLE
    TOGGLE -->|"Sim → bqmlEnabled: true"| BODY
    TOGGLE -->|"Nao → bqmlEnabled: false"| BODY
    BODY --> API
    API --> AUTH
    AUTH -->|"Nao"| AUTH_FAIL
    AUTH -->|"Sim"| ACCESS
    ACCESS -->|"Nao"| ACCESS_FAIL
    ACCESS -->|"Sim"| ORCH

    subgraph ORCHESTRATOR ["🎯 Canvas Orchestrator (model: reasoning, max 30 steps)"]
        direction TB
        ORCH["Monta system prompt<br/><i>regras + filtros + estado paginas</i>"]:::orch
        BQML_CHECK{"bqmlEnabled?"}:::decision
        INJECT_BQML["Injeta secao BigQuery ML<br/><i>CREATE MODEL, ML.PREDICT,<br/>ML.FORECAST, ML.EVALUATE</i>"]:::bqml
        SELECTED{"selectedBlockIds?"}:::decision
        INJECT_SEL["Injeta regra de edicao focada"]:::orch
        PLAN["🔧 plan_analysis<br/><i>Estrutura paginas e blocos</i>"]:::tool
        SCHEMA["🔧 get_table_schema + get_sample_data<br/><i>Entende estrutura dos dados</i>"]:::tool

        ORCH --> BQML_CHECK
        BQML_CHECK -->|"Sim"| INJECT_BQML --> SELECTED
        BQML_CHECK -->|"Nao"| SELECTED
        SELECTED -->|"Sim"| INJECT_SEL --> PLAN
        SELECTED -->|"Nao"| PLAN
        PLAN --> SCHEMA
    end

    SCHEMA --> INTENT

    INTENT{"Qual a intencao?"}:::decision

    %% Branch: Nova visualizacao
    INTENT -->|"Nova visualizacao"| CREATE_PAGE
    CREATE_PAGE["🔧 create_page<br/><i>titulo, descricao, filters?</i>"]:::block
    CREATE_PAGE --> QUERY_DATA

    %% Branch: Editar existente
    INTENT -->|"Editar pagina existente"| EDIT_FLOW
    EDIT_FLOW["🔧 remove_block → add_*_block<br/><i>Mesmo pageIndex, NUNCA cria nova</i>"]:::block
    EDIT_FLOW --> QUERY_DATA

    %% Branch: Pergunta analitica
    INTENT -->|"Pergunta analitica complexa"| ANALYZE
    ANALYZE["🔧 analyze()"]:::subagent

    %% Branch: Resposta simples
    INTENT -->|"Pergunta simples"| CHAT_RESP
    CHAT_RESP["Responde diretamente no chat"]:::orch

    %% Query loop
    QUERY_DATA["🔧 query_data<br/><i>SQL read-only, max 500 rows</i>"]:::tool
    QUERY_ML{"Query usa ML?"}:::decision
    QUERY_DATA --> QUERY_ML
    QUERY_ML -->|"Sim → timeout 300s"| QUERY_EXEC
    QUERY_ML -->|"Nao → timeout 60s"| QUERY_EXEC
    QUERY_EXEC["Executa no BigQuery"]:::tool
    QUERY_EXEC --> BUILD_BLOCKS

    %% Build blocks
    BUILD_BLOCKS{"Tipo de bloco?"}:::decision
    BUILD_BLOCKS -->|"KPI"| KPI["🔧 add_kpi_block<br/><i>label, value, sparkline 10m,<br/>trend, colSpan=1</i>"]:::block
    BUILD_BLOCKS -->|"Grafico"| CHART["🔧 add_chart_block<br/><i>chartType, data, dataKeys,<br/>xAxisKey, colSpan=2-3</i>"]:::block
    BUILD_BLOCKS -->|"Tabela"| TABLE["🔧 add_table_block<br/><i>columns, rows max 100,<br/>colSpan=3</i>"]:::block
    BUILD_BLOCKS -->|"Texto"| TEXT["🔧 add_text_block<br/><i>markdown, colSpan=2</i>"]:::block

    KPI --> MORE
    CHART --> MORE
    TABLE --> MORE
    TEXT --> MORE
    MORE{"Mais blocos?"}:::decision
    MORE -->|"Sim"| QUERY_DATA
    MORE -->|"Nao"| NEEDS_ANALYSIS

    NEEDS_ANALYSIS{"Precisa analise especializada?"}:::decision
    NEEDS_ANALYSIS -->|"Sim"| ANALYZE
    NEEDS_ANALYSIS -->|"Nao"| FINAL

    %% Sub-agent flow
    subgraph SUB_AGENT ["🤖 Sub-Agente (model: fast, max 8 steps)"]
        direction TB
        ANALYZE --> WHICH_AGENT
        WHICH_AGENT{"Qual agente?"}:::decision
        WHICH_AGENT -->|"O que aconteceu?"| DESC["Descritivo<br/><i>Benchmarks, estatisticas</i>"]:::subagent
        WHICH_AGENT -->|"Por que?"| DIAG["Diagnostico<br/><i>HHI, correlacao, decomposicao</i>"]:::subagent
        WHICH_AGENT -->|"O que vai acontecer?"| PRED["Preditivo<br/><i>ARIMA_PLUS, LOGISTIC_REG</i>"]:::subagent
        WHICH_AGENT -->|"E se...?"| SIM["Simulacao<br/><i>Stress test, Monte Carlo</i>"]:::subagent
        WHICH_AGENT -->|"O que fazer?"| PRESC["Prescritivo<br/><i>KMEANS, ranking, ROI</i>"]:::subagent
        WHICH_AGENT -->|"Algo errado?"| MON["Monitoramento<br/><i>Anomalias, covenants, CRI</i>"]:::subagent
        WHICH_AGENT -->|"Fluxos?"| CASH["Fluxo de Caixa<br/><i>WAL, excess spread, OC/IC</i>"]:::subagent
        WHICH_AGENT -->|"Macro?"| EXT["Externo<br/><i>Selic, IPCA, mercado</i>"]:::subagent

        DESC --> SUB_TOOLS
        DIAG --> SUB_TOOLS
        PRED --> SUB_BQML
        SIM --> SUB_BQML
        PRESC --> SUB_BQML
        MON --> SUB_BQML
        CASH --> SUB_TOOLS
        EXT --> SUB_TOOLS

        SUB_BQML{"bqmlEnabled?"}:::decision
        SUB_BQML -->|"Sim → CREATE MODEL, ML.*"| SUB_ML["🧠 BigQuery ML<br/><i>ARIMA_PLUS, LOGISTIC_REG,<br/>KMEANS, BOOSTED_TREE,<br/>ML.DETECT_ANOMALIES</i>"]:::bqml
        SUB_BQML -->|"Nao → SQL puro"| SUB_TOOLS
        SUB_ML --> SUB_TOOLS

        SUB_TOOLS["🔧 execute_sql + get_table_schema<br/>+ get_sample_data"]:::tool
        SUB_TOOLS --> SUB_RESULT["Retorna texto analitico<br/>+ toolCalls ao orchestrator"]:::subagent
    end

    SUB_RESULT --> FINAL

    %% Final response
    FINAL["💬 Resposta final ao usuario<br/><i>Texto narrativo no chat</i>"]:::orch

    subgraph FRONTEND ["📱 Frontend (tempo real via SSE)"]
        direction LR
        FINAL --> STREAM
        STREAM["SSE Stream"]:::frontend
        STREAM --> CANVAS["CanvasPanel re-renderiza<br/><i>Blocos aparecem em tempo real</i>"]:::frontend
        STREAM --> SAVE["Auto-save Firestore<br/><i>debouncedSave 1.5s</i>"]:::frontend
    end
`;

export function MermaidDiagram() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const renderIdRef = useRef(0);

  useEffect(() => {
    const currentId = ++renderIdRef.current;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#0A0B10',
            primaryColor: '#1a1a2e',
            primaryTextColor: '#ccc',
            primaryBorderColor: '#F3A169',
            lineColor: '#444',
            secondaryColor: '#1a1a2e',
            tertiaryColor: '#0d1117',
            fontFamily: 'Inter, sans-serif',
            fontSize: '12px',
            nodeBorder: '#555',
          },
          flowchart: {
            curve: 'basis',
            padding: 15,
            nodeSpacing: 30,
            rankSpacing: 40,
            htmlLabels: true,
            useMaxWidth: true,
          },
        });

        // Use unique id to avoid collisions on re-render
        const { svg } = await mermaid.render(`mermaid-flow-${currentId}`, DIAGRAM);
        if (currentId !== renderIdRef.current) return;

        setSvgContent(svg);
      } catch (err) {
        if (currentId === renderIdRef.current) {
          setError(err instanceof Error ? err.message : 'Erro ao renderizar diagrama');
          console.error('[MermaidDiagram]', err);
        }
      }
    }

    render();
  }, []);

  return (
    <div className="py-8 px-4">
      <h2 className="text-lg font-bold text-foreground tracking-tight text-center">Fluxograma Condicional</h2>
      <p className="text-xs text-muted-foreground/80 text-center mb-6">
        Fluxo completo com decisoes condicionais — desde a mensagem do usuario ate a renderizacao dos blocos
      </p>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 mb-6">
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-sm border border-primary bg-primary/10" />
          <span className="text-muted-foreground/80">Orchestrator / Decisao</span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-sm border border-[#6ECB8A] bg-[#6ECB8A]/10" />
          <span className="text-muted-foreground/80">Tool (query/planning)</span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-sm border border-[#7AA2F7] bg-[#7AA2F7]/10" />
          <span className="text-muted-foreground/80">Tool (block/layout)</span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-sm border border-[#F27C7C] bg-[#F27C7C]/10" />
          <span className="text-muted-foreground/80">Sub-agente</span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-sm border border-[#a855f7] bg-[#a855f7]/10" />
          <span className="text-muted-foreground/80">BigQuery ML</span>
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.04] p-4 text-[12px] text-red-400/70 text-center">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-[#05060a] p-6 [&_svg]:max-w-none [&_.edgeLabel]:text-[10px]">
        {svgContent ? (
          <div dangerouslySetInnerHTML={{ __html: svgContent }} />
        ) : !error ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[11px] text-muted-foreground/60 animate-pulse">Renderizando diagrama...</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
