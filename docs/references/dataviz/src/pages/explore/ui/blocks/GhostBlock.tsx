'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Vazio e erro desenhados sobre um FANTASMA do próprio bloco.
 *
 * O bloco desenha a si mesmo com dado plausível, esmaecido e sem interação, e a
 * mensagem vem por cima. O leitor reconhece a forma do que deveria estar ali —
 * um donut, uma série, uma matriz — e o card não muda de altura entre
 * "carregou" e "não carregou".
 *
 * O fantasma tem de ser ILEGÍVEL: opacidade baixa, dessaturado e desfocado. Um
 * número de mentira que se lê é pior que caixa cinza, porque passa por dado.
 * `aria-hidden` e `pointer-events-none` fecham o resto — leitor de tela e
 * teclado nunca o alcançam.
 *
 * ─── A mensagem é uma etiqueta, não um diálogo ───
 *
 * Uma tentativa anterior deu ao erro um cartão com sombra, distintivo circular
 * e largura fixa. Ficou parecendo um modal preso dentro do card — peso de
 * interrupção para algo que é só um estado. A etiqueta discreta que o vazio já
 * usava é a forma certa; o erro usa a MESMA, e se distingue por cor e conteúdo,
 * não por tamanho.
 */

type BlockState = 'vazio' | 'erro' | 'sem-metrica';

const TONE = {
  vazio: {
    icon: Inbox,
    border: 'border-border',
    background: 'bg-popover/80',
    ink: 'text-muted-foreground',
    ring: null,
  },
  'sem-metrica': {
    icon: SlidersHorizontal,
    border: 'border-border',
    background: 'bg-popover/80',
    ink: 'text-muted-foreground',
    ring: null,
  },
  erro: {
    icon: AlertTriangle,
    border: 'border-destructive/30',
    // Opaco, e não `bg-destructive/5`: com fundo translúcido o fantasma
    // atravessava o texto e lavava justamente a linha que explica a falha.
    background: 'bg-popover',
    ink: 'text-destructive',
    // O anel existe para o bloco que falhou ser achável ao varrer a página:
    // numa tela com oito blocos, a etiqueta central sozinha não salta.
    ring: 'ring-1 ring-destructive/25',
  },
} as const;

export function GhostBlock({
  estado: state,
  title,
  message,
  detail,
  onRetry,
  children,
}: {
  estado: BlockState;
  /**
   * Qual indicador falhou. Só o erro usa — numa página com três blocos
   * falhando, três etiquetas vermelhas idênticas não dizem qual perdeu. O
   * vazio dispensa: ele não pede ação, e o título já está no card atrás.
   */
  title?: string | undefined;
  message: string;
  /** Segunda linha: a métrica, o motivo. */
  detail?: string | undefined;
  onRetry?: (() => void) | undefined;
  /** O bloco desenhado com dado de mentira. */
  children: ReactNode;
}) {
  const tone = TONE[state];
  const Icon = tone.icon;

  return (
    <div data-casca="" className={cn('relative h-full', tone.ring && `rounded-2xl ${tone.ring}`)}>
      <div
        aria-hidden="true"
        className="pointer-events-none h-full select-none opacity-[0.13] grayscale blur-[1px]"
      >
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            'flex max-w-[85%] flex-col items-center gap-1.5 rounded-xl border px-4 py-3 text-center backdrop-blur-[2px]',
            tone.border, tone.background,
          )}
        >
          <Icon className={cn('size-4', tone.ink)} strokeWidth={1.75} aria-hidden="true" />

          {title && (
            <p className="max-w-full truncate text-[11px] text-muted-foreground/80">{title}</p>
          )}

          <p className={cn('text-xs font-medium', tone.ink)}>{message}</p>

          {detail && (
            // Contraste de leitura: é a linha que diz O QUE houve, e numa
            // versão anterior era o texto mais apagado do estado.
            <p className="text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
          )}

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
