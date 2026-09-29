'use client';

import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip';
import { GLOSSARY, getGlossaryDefinition } from '@/shared/config/glossary';

interface InfoTooltipProps {
  /** Chave do glossário para buscar o texto automaticamente */
  term?: keyof typeof GLOSSARY;
  /** Texto livre — usado quando não há termo no glossário */
  text?: string;
  className?: string;
}

export function InfoTooltip({ term, text, className }: InfoTooltipProps) {
  const content = term ? getGlossaryDefinition(term) : text;
  if (!content) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground transition-colors ${className ?? ''}`}
            aria-label={content}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="max-w-xs text-sm leading-relaxed px-4 py-3 bg-popover border border-border text-foreground backdrop-blur-xl [&>svg]:fill-[var(--color-popover)] [&>svg]:text-[var(--color-popover)]"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
