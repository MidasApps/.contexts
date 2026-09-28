'use client';

import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SqlPreviewProps {
  sql: string;
  className?: string;
}

export function SqlPreview({ sql, className }: SqlPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const firstLine = sql.split('\n')[0] ?? sql;
  const hasMore = sql.split('\n').length > 1 || sql.length > firstLine.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-cyan-500/15 bg-muted/40 text-[11px]',
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-400/50">
          SQL
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            aria-label="Copiar SQL"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" strokeWidth={2} />
            ) : (
              <Copy className="h-3 w-3" strokeWidth={1.5} />
            )}
            <span className="text-[10px]">{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>
      </div>

      {/* Code */}
      <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11px] text-cyan-300/80 leading-relaxed">
        {expanded ? sql : firstLine}
      </pre>

      {/* Expand toggle */}
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-1.5 text-[10px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" strokeWidth={1.5} />
              Recolher
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
              ver query completa
            </>
          )}
        </button>
      )}
    </div>
  );
}
