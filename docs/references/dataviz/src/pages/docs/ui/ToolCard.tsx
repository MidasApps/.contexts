'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { AgentTool } from './docs-data';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  planning: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  query: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  block: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  layout: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  filter: { bg: 'bg-muted/40', text: 'text-muted-foreground', border: 'border-border' },
  delegation: { bg: 'bg-red-400/10', text: 'text-red-400', border: 'border-red-400/20' },
};

export function ToolCard({ tool }: { tool: AgentTool }) {
  const [expanded, setExpanded] = useState(false);
  const colors = CATEGORY_COLORS[tool.category] ?? CATEGORY_COLORS.filter;

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted/40 transition-colors',
        expanded && 'border-border bg-muted/40',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className={cn('text-[13px] font-semibold', colors.text)}>{tool.name}</span>
        <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium', colors.bg, colors.text)}>
          {tool.category}
        </span>
        <span className="ml-auto flex-shrink-0">
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground/60 transition-transform', expanded && 'rotate-180')} />
        </span>
      </button>
      <div className="px-4 pb-3 -mt-1">
        <p className="text-[11px] text-muted-foreground leading-relaxed">{tool.description}</p>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {tool.inputParams && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">Input</div>
              <pre className="text-[11px] text-muted-foreground font-mono bg-black/30 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {tool.inputParams}
              </pre>
            </div>
          )}
          {tool.outputDesc && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">Output</div>
              <pre className="text-[11px] text-muted-foreground font-mono bg-black/30 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {tool.outputDesc}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
