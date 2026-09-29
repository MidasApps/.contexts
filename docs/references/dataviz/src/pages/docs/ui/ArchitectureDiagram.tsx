'use client';

import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { AGENTS } from './docs-data';
import type { AgentTool } from './docs-data';

interface ArchitectureDiagramProps {
  onSelectAgent: (id: string) => void;
  onSelectContext: (id: string) => void;
}

const orchestrator = AGENTS.find((a) => a.id === 'canvas-orchestrator')!;
const subAgents = AGENTS.filter((a) => a.id !== 'canvas-orchestrator');

/** Map diagram labels → matching tool names from the orchestrator */
const TOOL_GROUPS = [
  { label: 'plan_analysis', match: ['plan_analysis'], color: 'text-emerald-400', border: 'border-emerald-500/20', hoverBg: 'hover:bg-emerald-500/10' },
  { label: 'query_data', match: ['query_data'], color: 'text-emerald-400', border: 'border-emerald-500/20', hoverBg: 'hover:bg-emerald-500/10' },
  { label: 'create_page', match: ['create_page'], color: 'text-blue-400', border: 'border-blue-500/20', hoverBg: 'hover:bg-blue-500/10' },
  { label: 'add_*_block', match: ['add_text_block', 'add_kpi_block', 'add_kpis_block', 'add_chart_block', 'add_table_block'], color: 'text-blue-400', border: 'border-blue-500/20', hoverBg: 'hover:bg-blue-500/10' },
  { label: 'update_*', match: ['update_text_block', 'update_kpis_block', 'update_chart_block', 'update_table_block'], color: 'text-blue-400', border: 'border-blue-500/20', hoverBg: 'hover:bg-blue-500/10' },
  { label: 'move_block', match: ['move_block'], color: 'text-blue-400', border: 'border-blue-500/20', hoverBg: 'hover:bg-blue-500/10' },
  { label: 'remove_block', match: ['remove_block'], color: 'text-blue-400', border: 'border-blue-500/20', hoverBg: 'hover:bg-blue-500/10' },
  { label: 'get_schema', match: ['get_table_schema'], color: 'text-emerald-400', border: 'border-emerald-500/20', hoverBg: 'hover:bg-emerald-500/10' },
  { label: 'get_sample', match: ['get_sample_data'], color: 'text-emerald-400', border: 'border-emerald-500/20', hoverBg: 'hover:bg-emerald-500/10' },
  { label: 'get_filters', match: ['get_filter_options'], color: 'text-muted-foreground', border: 'border-border', hoverBg: 'hover:bg-muted/50' },
  { label: 'set_filters', match: ['set_filters'], color: 'text-muted-foreground', border: 'border-border', hoverBg: 'hover:bg-muted/50' },
  { label: 'analyze()', match: ['analyze'], color: 'text-red-400', border: 'border-red-400/20', hoverBg: 'hover:bg-red-400/10', bold: true },
];

const CONTEXT_ITEMS = [
  { id: 'businessRules', label: 'Business Rules' },
  { id: 'schema', label: 'Schema BigQuery' },
  { id: 'sqlRules', label: 'SQL Rules' },
  { id: 'dynamicFilters', label: 'Filtros Dinamicos' },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  query: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  block: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  layout: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  filter: { bg: 'bg-muted/40', text: 'text-muted-foreground' },
  delegation: { bg: 'bg-red-400/10', text: 'text-red-400' },
};

function ToolModal({ tools, label, onClose }: { tools: AgentTool[]; label: string; onClose: () => void }) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover/95 backdrop-blur-sm px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">{label}</h3>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {tools.length === 1 ? 'Schema da tool' : `${tools.length} tools neste grupo`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/80 hover:bg-muted/70 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tools */}
        <div className="p-4 space-y-2">
          {tools.map((tool) => {
            const isExpanded = expandedTool === tool.name;
            const colors = CATEGORY_COLORS[tool.category] ?? CATEGORY_COLORS.filter;

            return (
              <div key={tool.name} className="rounded-xl border border-border bg-muted/40 overflow-hidden">
                {/* Tool header */}
                <button
                  type="button"
                  onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className={cn('text-[13px] font-semibold font-mono', colors.text)}>{tool.name}</span>
                  <span className={cn('rounded-md px-2 py-0.5 text-[9px] font-medium', colors.bg, colors.text)}>
                    {tool.category}
                  </span>
                  <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-muted-foreground/60 transition-transform', isExpanded && 'rotate-180')} />
                </button>

                {/* Description */}
                <div className="px-4 pb-3 -mt-1">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{tool.description}</p>
                </div>

                {/* Expanded: input/output */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-3">
                    {tool.inputParams && (
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5">Input Parameters</div>
                        <pre className="text-[11px] text-muted-foreground font-mono bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-[1.7]">
                          {tool.inputParams}
                        </pre>
                      </div>
                    )}
                    {tool.outputDesc && (
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5">Output</div>
                        <pre className="text-[11px] text-muted-foreground font-mono bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-[1.7]">
                          {tool.outputDesc}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// BQML content for the modal
const BQML_INFO: AgentTool = {
  name: 'BigQuery ML',
  category: 'query',
  description: 'Quando o usuario ativa "Analise Profunda", o orchestrator ganha acesso a BigQuery ML. Isso afeta o system prompt (injeta secao BQML com capacidades e regras) e o query_data (libera CREATE MODEL e ML.*).',
  inputParams: `## Ativacao
Toggle "Analise Profunda" no chat → bqmlEnabled=true

## O que muda no system prompt
Injeta secao "BigQuery ML — ATIVADO" com:
- CREATE MODEL (LINEAR_REG, LOGISTIC_REG, KMEANS, ARIMA_PLUS, BOOSTED_TREE_*, DNN_*)
- ML.PREDICT, ML.EVALUATE, ML.EXPLAIN_PREDICT, ML.FORECAST
- Regras: criar modelos em \`dataset.ml_models.*\`, usar CREATE OR REPLACE
- Sempre avaliar com ML.EVALUATE apos treinar

## O que muda no query_data
- allowedPatterns: adiciona CREATE MODEL
- blockedPatterns: remove CREATE/ALTER do blocklist
- Timeout: 300s para queries ML (vs 60s normal)

## Fluxo
ConversationSidebar (toggle bqmlEnabled)
  → POST /api/canvas-chat { bqmlEnabled: true }
    → orchestrator.ts: buildCanvasOrchestratorPrompt({ bqmlEnabled })
    → orchestrator.ts: createQueryDataTool(dataset, bqmlEnabled)`,
  outputDesc: `## Arquivos envolvidos
- src/pages/explore/ui/ConversationSidebar.tsx:331 — state bqmlEnabled
- src/pages/explore/ui/ConversationSidebar.tsx:546 — body.bqmlEnabled
- src/features/canvas-orchestrator/orchestrator.ts:41,59 — passa para prompt e tool
- src/shared/config/agents/canvas-orchestrator.ts:191-229 — injeta secao BQML no prompt
- src/features/canvas-orchestrator/tools/query-data.ts:7-13 — libera CREATE MODEL

## Modelos suportados
LINEAR_REG, LOGISTIC_REG, KMEANS, ARIMA_PLUS
BOOSTED_TREE_CLASSIFIER, BOOSTED_TREE_REGRESSOR
DNN_CLASSIFIER, DNN_REGRESSOR

## Sub-agentes que usam BQML (via analyze)
- Predictive: ARIMA_PLUS, LOGISTIC_REG, BOOSTED_TREE
- Simulation: ARIMA_PLUS (Monte Carlo), LINEAR_REG (macro stress)
- Prescriptive: KMEANS (clustering), LINEAR_REG (ROI)
- Monitoring: ML.DETECT_ANOMALIES (ARIMA_PLUS)`,
};

export function ArchitectureDiagram({ onSelectAgent, onSelectContext }: ArchitectureDiagramProps) {
  const [modalGroup, setModalGroup] = useState<{ label: string; tools: AgentTool[] } | null>(null);

  const handleToolClick = (group: typeof TOOL_GROUPS[number]) => {
    const matchedTools = orchestrator.tools.filter((t) => group.match.includes(t.name));
    if (matchedTools.length > 0) {
      setModalGroup({ label: group.label, tools: matchedTools });
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-2 py-8 px-4">
        {/* Title */}
        <h2 className="text-lg font-bold text-foreground tracking-tight">Arquitetura Multi-Agent</h2>
        <p className="text-xs text-muted-foreground/80 mb-6">Clique em qualquer componente para ver detalhes</p>

        {/* User node + BQML toggle */}
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
            Usuario (Chat)
          </div>
          <button
            type="button"
            onClick={() => setModalGroup({ label: 'BigQuery ML', tools: [BQML_INFO] })}
            className="rounded-lg border border-purple-500/30 bg-purple-500/[0.08] px-3 py-2 text-center transition-all hover:bg-purple-500/[0.15] hover:border-purple-500/50 group"
          >
            <div className="text-[10px] font-bold text-purple-400 group-hover:text-purple-300">BQML</div>
            <div className="text-[8px] text-purple-400/50 mt-0.5">toggle</div>
          </button>
        </div>

        {/* Connector */}
        <div className="w-px h-5 bg-muted" />

        {/* API */}
        <div className="rounded-xl border border-border bg-muted/40 px-5 py-2 text-[11px] text-blue-400 font-mono">
          <span>POST /api/canvas-chat</span>
          <span className="ml-2 text-[9px] text-purple-400/50">{'{ bqmlEnabled? }'}</span>
        </div>

        {/* Connector */}
        <div className="w-px h-5 bg-muted" />

        {/* Orchestrator */}
        <button
          type="button"
          onClick={() => onSelectAgent('canvas-orchestrator')}
          className="group rounded-2xl border-2 border-primary bg-primary/[0.06] px-8 py-4 transition-all hover:bg-primary/[0.12] hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="text-[15px] font-bold text-primary mb-2">Canvas Orchestrator</div>
          <div className="flex items-center justify-center gap-2">
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[9px] font-semibold text-primary">reasoning</span>
            <span className="rounded-md bg-muted/40 px-2 py-0.5 text-[9px] text-muted-foreground/80">30 steps</span>
            <span className="rounded-md bg-muted/40 px-2 py-0.5 text-[9px] text-muted-foreground/80">18 tools</span>
          </div>
        </button>

        {/* Tool badges — clickable */}
        <div className="flex flex-wrap justify-center gap-2 max-w-[520px] mt-2">
          {TOOL_GROUPS.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => handleToolClick(t)}
              className={cn(
                'rounded-md border bg-black/30 px-2.5 py-1 text-[10px] font-mono cursor-pointer transition-colors',
                t.color, t.border, t.hoverBg,
                t.bold && 'font-semibold',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Delegation arrow */}
        <div className="flex flex-col items-center gap-1 mt-2">
          <span className="text-[10px] text-red-400/70">delega via analyze()</span>
          <div className="w-px h-4 bg-red-400/40" />
        </div>

        {/* Sub-agents grid */}
        <div className="flex flex-wrap justify-center gap-2.5 max-w-[600px]">
          {subAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className="group rounded-xl border border-red-400/15 bg-red-400/[0.04] px-4 py-2.5 text-center transition-all hover:bg-red-400/[0.08] hover:border-red-400/30"
            >
              <div className="text-[11px] font-semibold text-red-400 group-hover:text-red-300">{agent.name}</div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5">{agent.question}</div>
            </button>
          ))}
        </div>

        {/* Shared context */}
        <div className="mt-8 w-full max-w-[600px] border-t border-border pt-4">
          <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-3">
            Contexto Compartilhado (injetado em todos os agentes)
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {CONTEXT_ITEMS.map((ctx) => (
              <button
                key={ctx.id}
                type="button"
                onClick={() => onSelectContext(ctx.id)}
                className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                {ctx.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tool modal */}
      {modalGroup && (
        <ToolModal
          tools={modalGroup.tools}
          label={modalGroup.label}
          onClose={() => setModalGroup(null)}
        />
      )}
    </>
  );
}
