'use client';

import { ArrowLeft } from 'lucide-react';
import type { SharedContextEntry } from './docs-data';

interface ContextPageProps {
  context: SharedContextEntry;
  onBack: () => void;
}

export function ContextPage({ context, onBack }: ContextPageProps) {
  return (
    <div className="space-y-6 pb-12">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 hover:text-muted-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </button>

      <div>
        <h2 className="text-lg font-bold text-foreground tracking-tight">{context.label}</h2>
        <p className="text-[13px] text-muted-foreground mt-1">{context.description}</p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <pre className="p-5 text-[11px] text-foreground/55 font-mono leading-[1.7] overflow-x-auto whitespace-pre-wrap max-h-[700px] overflow-y-auto">
          {context.content}
        </pre>
      </div>
    </div>
  );
}
