'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/lib/utils';
import { AGENTS, SHARED_CONTEXTS } from './docs-data';
import { ArchitectureDiagram } from './ArchitectureDiagram';
import { FlowDiagram } from './FlowDiagram';
import { MermaidDiagram } from './MermaidDiagram';
import { AgentDetail } from './AgentDetail';
import { ContextPage } from './ContextPage';
import {
  LayoutDashboard, Bot, Brain, Search, TrendingUp,
  FlaskConical, Target, ShieldAlert, DollarSign, Globe, BookOpen,
  Database, Code, Filter, GitBranch, Network,
} from 'lucide-react';

type View =
  | { type: 'overview' }
  | { type: 'agent'; id: string }
  | { type: 'context'; id: string };

const AGENT_ICONS: Record<string, React.ElementType> = {
  'canvas-orchestrator': LayoutDashboard,
  descriptive: Brain,
  diagnostic: Search,
  predictive: TrendingUp,
  simulation: FlaskConical,
  prescriptive: Target,
  monitoring: ShieldAlert,
  cashflow: DollarSign,
  external: Globe,
};

const CONTEXT_ICONS: Record<string, React.ElementType> = {
  businessRules: BookOpen,
  schema: Database,
  sqlRules: Code,
  dynamicFilters: Filter,
};

export function DocsPage() {
  const [view, setView] = useState<View>({ type: 'overview' });
  const [overviewTab, setOverviewTab] = useState<'architecture' | 'flow' | 'mermaid'>('architecture');

  const orchestrator = AGENTS.find((a) => a.id === 'canvas-orchestrator')!;
  const subAgents = AGENTS.filter((a) => a.id !== 'canvas-orchestrator');

  const handleSelectAgent = (id: string) => setView({ type: 'agent', id });
  const handleSelectContext = (id: string) => setView({ type: 'context', id });
  const handleBack = () => setView({ type: 'overview' });

  const activeAgentId = view.type === 'agent' ? view.id : null;
  const activeContextId = view.type === 'context' ? view.id : null;

  return (
    <div className="flex h-screen bg-popover text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col overflow-y-auto bg-background">
        <div className="px-5 py-5">
          <div className="text-sm font-bold text-foreground tracking-tight">Agent Docs</div>
          <div className="text-[10px] text-muted-foreground/60 mt-0.5">DataViz</div>
        </div>

        <div className="h-px bg-muted/50" />

        <nav className="flex-1 px-3 py-3 space-y-1">
          {/* Overview */}
          <SidebarSection label="ARQUITETURA" />
          <SidebarItem
            icon={Network}
            label="Organograma"
            active={view.type === 'overview' && overviewTab === 'architecture'}
            onClick={() => { handleBack(); setOverviewTab('architecture'); }}
          />
          <SidebarItem
            icon={GitBranch}
            label="Fluxo Linear"
            active={view.type === 'overview' && overviewTab === 'flow'}
            onClick={() => { handleBack(); setOverviewTab('flow'); }}
          />
          <SidebarItem
            icon={GitBranch}
            label="Fluxo Condicional"
            active={view.type === 'overview' && overviewTab === 'mermaid'}
            onClick={() => { handleBack(); setOverviewTab('mermaid'); }}
          />

          {/* Orchestrator */}
          <SidebarSection label="ORQUESTRADOR" />
          <SidebarItem
            icon={AGENT_ICONS['canvas-orchestrator']}
            label={orchestrator.name}
            active={activeAgentId === 'canvas-orchestrator'}
            onClick={() => handleSelectAgent('canvas-orchestrator')}
            accent
          />

          {/* Sub-agents */}
          <SidebarSection label="SUB-AGENTES" />
          {subAgents.map((agent) => {
            const Icon = AGENT_ICONS[agent.id] ?? Bot;
            return (
              <SidebarItem
                key={agent.id}
                icon={Icon}
                label={agent.name}
                active={activeAgentId === agent.id}
                onClick={() => handleSelectAgent(agent.id)}
              />
            );
          })}

          {/* Contexts */}
          <SidebarSection label="CONTEXTO" />
          {SHARED_CONTEXTS.map((ctx) => {
            const Icon = CONTEXT_ICONS[ctx.id] ?? BookOpen;
            return (
              <SidebarItem
                key={ctx.id}
                icon={Icon}
                label={ctx.label}
                active={activeContextId === ctx.id}
                onClick={() => handleSelectContext(ctx.id)}
              />
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-[11px] text-muted-foreground/80 hover:text-muted-foreground transition-colors"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Voltar ao Dashboard
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-8">
          {view.type === 'overview' && (
            <div>
              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-border mb-4">
                <button
                  type="button"
                  onClick={() => setOverviewTab('architecture')}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px',
                    overviewTab === 'architecture'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground/80 hover:text-muted-foreground',
                  )}
                >
                  <Network className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Organograma
                </button>
                <button
                  type="button"
                  onClick={() => setOverviewTab('flow')}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px',
                    overviewTab === 'flow'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground/80 hover:text-muted-foreground',
                  )}
                >
                  <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Fluxo Linear
                </button>
                <button
                  type="button"
                  onClick={() => setOverviewTab('mermaid')}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px',
                    overviewTab === 'mermaid'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground/80 hover:text-muted-foreground',
                  )}
                >
                  <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Fluxo Condicional
                </button>
              </div>

              {overviewTab === 'architecture' ? (
                <ArchitectureDiagram
                  onSelectAgent={handleSelectAgent}
                  onSelectContext={handleSelectContext}
                />
              ) : overviewTab === 'flow' ? (
                <FlowDiagram />
              ) : (
                <MermaidDiagram />
              )}
            </div>
          )}

          {view.type === 'agent' && (() => {
            const agent = AGENTS.find((a) => a.id === view.id);
            if (!agent) return null;
            return (
              <AgentDetail
                agent={agent}
                onBack={handleBack}
                onSelectContext={handleSelectContext}
              />
            );
          })()}

          {view.type === 'context' && (() => {
            const ctx = SHARED_CONTEXTS.find((c) => c.id === view.id);
            if (!ctx) return null;
            return <ContextPage context={ctx} onBack={handleBack} />;
          })()}
        </div>
      </main>
    </div>
  );
}

// ── Sidebar helpers ──

function SidebarSection({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground/40 px-2.5 pt-4 pb-1">
      {label}
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors text-left',
        active
          ? accent
            ? 'bg-primary/10 text-primary'
            : 'bg-muted/70 text-foreground'
          : 'text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground/65',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{label}</span>
    </button>
  );
}
