'use client';

import { ArrowLeft } from 'lucide-react';
import { PromptViewer } from './PromptViewer';
import { ToolCard } from './ToolCard';
import type { AgentEntry } from './docs-data';
import { SHARED_CONTEXTS } from './docs-data';

interface AgentDetailProps {
  agent: AgentEntry;
  onBack: () => void;
  onSelectContext: (id: string) => void;
}

const MODEL_BADGES: Record<string, { label: string; color: string }> = {
  reasoning: { label: 'reasoning', color: 'bg-primary/15 text-primary' },
  fast: { label: 'fast', color: 'bg-purple-500/15 text-purple-400' },
  router: { label: 'router', color: 'bg-blue-500/15 text-blue-400' },
};

export function AgentDetail({ agent, onBack, onSelectContext }: AgentDetailProps) {
  const modelBadge = MODEL_BADGES[agent.modelTier] ?? MODEL_BADGES.fast;

  return (
    <div className="space-y-6 pb-12">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 hover:text-muted-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-primary/30 bg-primary/[0.06]">
          <span className="text-lg text-primary">
            {agent.id === 'canvas-orchestrator' ? '⚙' : '🤖'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground tracking-tight">{agent.name}</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-md px-2.5 py-1 text-[10px] font-semibold ${modelBadge.color}`}>
            {modelBadge.label}
          </span>
          <span className="rounded-md bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground/80">
            {agent.maxSteps} steps
          </span>
        </div>
      </div>

      {/* Context badges */}
      {agent.contexts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agent.contexts.map((ctxId) => {
            const ctx = SHARED_CONTEXTS.find((c) => c.id === ctxId);
            return (
              <button
                key={ctxId}
                type="button"
                onClick={() => onSelectContext(ctxId)}
                className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <span className="text-muted-foreground/40">{'🔗'}</span>
                {ctx?.label ?? ctxId}
              </button>
            );
          })}
        </div>
      )}

      {/* System Prompt */}
      <PromptViewer summary={agent.promptSummary} fullPrompt={agent.fullPrompt} />

      {/* Tools */}
      {agent.tools.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-foreground mb-3">
            Tools ({agent.tools.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {agent.tools.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
