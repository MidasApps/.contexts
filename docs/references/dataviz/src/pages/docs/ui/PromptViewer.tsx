'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface PromptViewerProps {
  summary: string[];
  fullPrompt: string;
}

export function PromptViewer({ summary, fullPrompt }: PromptViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Summary */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-[13px] font-semibold text-primary">System Prompt</span>
        </div>
        <div className="text-[12px] font-semibold text-foreground mb-2">Regras-chave:</div>
        <ul className="space-y-1.5">
          {summary.map((rule, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-foreground/55 leading-relaxed">
              <span className="text-muted-foreground/40 shrink-0">-</span>
              <span dangerouslySetInnerHTML={{ __html: rule.replace(/`([^`]+)`/g, '<code class="text-primary bg-muted/40 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>') }} />
            </li>
          ))}
        </ul>
      </div>

      {/* Expand button */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground/80 hover:text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        {expanded ? 'Recolher prompt completo' : 'Ver prompt completo'}
      </button>

      {/* Full prompt */}
      {expanded && (
        <div className="border-t border-border bg-black/20 relative">
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[10px] text-muted-foreground/80 hover:text-muted-foreground transition-colors z-10"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <pre className="p-5 pr-24 text-[11px] text-muted-foreground font-mono leading-[1.7] overflow-x-auto whitespace-pre-wrap max-h-[600px] overflow-y-auto">
            {fullPrompt}
          </pre>
        </div>
      )}
    </div>
  );
}
