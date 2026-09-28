'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { MessageCircleQuestion } from 'lucide-react';
import type { ClarificationRequest } from '@/shared/config/agents/types';

interface ClarificationOptionsProps {
  clarification: ClarificationRequest;
  onResponse: (value: string) => void;
}

export function ClarificationOptions({ clarification, onResponse }: ClarificationOptionsProps) {
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const isAnswered = selectedValue !== null;

  const handleClick = (value: string) => {
    if (isAnswered) return;
    setSelectedValue(value);
    onResponse(value);
  };

  return (
    <div className="my-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
      <div className="flex items-start gap-2 mb-2">
        <MessageCircleQuestion className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" strokeWidth={1.5} />
        <p className="text-[13px] text-foreground leading-relaxed">{clarification.question}</p>
      </div>

      {clarification.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {clarification.options.map((opt) => {
            const isSelected = selectedValue === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleClick(opt.value)}
                disabled={isAnswered}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-[12px] transition-all',
                  isSelected
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : isAnswered
                      ? 'border-border bg-muted/40 text-muted-foreground/40 cursor-not-allowed'
                      : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/25 hover:bg-primary/5 hover:text-foreground',
                )}
                title={opt.description}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {clarification.options.length === 0 && !isAnswered && (
        <p className="text-[11px] text-muted-foreground/60 mt-1">Responda usando o campo de texto abaixo.</p>
      )}

      {isAnswered && (
        <p className="mt-2 text-[11px] text-muted-foreground/60">
          Respondido: {clarification.options.find(o => o.value === selectedValue)?.label ?? selectedValue}
        </p>
      )}
    </div>
  );
}
