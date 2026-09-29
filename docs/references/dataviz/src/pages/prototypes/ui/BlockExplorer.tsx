'use client';

import { useState } from 'react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { CanvasBlockRenderer } from '@/pages/explore/ui/CanvasBlockRenderer';
import {
  widthContextOf, widthOf, blockSpec,
} from '@/features/report-authoring/schema/block-specs';
import { HEIGHT, blockFamilyOf, type BlockFamily } from '@/pages/explore/ui/blocks/block-shell';
import { cn } from '@/shared/lib/utils';
import type { BlockExample } from './sample-blocks';

/**
 * O explorador — um bloco por vez, em todas as larguras e alturas.
 *
 * A galeria em largura única mostra se o bloco desenha; não mostra se ele
 * AGUENTA a faixa que o contrato promete. São perguntas diferentes: um gráfico
 * que fica bom em 3/6 pode ficar ridículo em 6/6 com uma série só, e uma tabela
 * que o contrato permite em 3/6 pode estar com scroll horizontal desde ali.
 *
 * Por isso ele desenha também as larguras que o contrato RECUSA. É o único
 * jeito de julgar se a recusa está certa: ver o bloco quebrado em 1/6 é o que
 * valida — ou derruba — o mínimo declarado no `block-specs.ts`.
 */

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3',
  4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
};

const ALL_WIDTHS = [1, 2, 3, 4, 5, 6] as const;

type WidthRole = 'recusada' | 'minima' | 'recomendada' | 'permitida' | 'maxima';

function widthRole(n: number, range: { min: number; recommended: number; max: number }): WidthRole {
  if (n < range.min || n > range.max) return 'recusada';
  if (n === range.recommended) return 'recomendada';
  if (n === range.min) return 'minima';
  if (n === range.max) return 'maxima';
  return 'permitida';
}

const ROLE_LABEL: Record<WidthRole, string> = {
  recusada: 'o contrato recusa',
  minima: 'mínima',
  recomendada: 'recomendada',
  permitida: 'permitida',
  maxima: 'máxima',
};

const ROLE_INK: Record<WidthRole, string> = {
  recusada: 'border-destructive/40 bg-destructive/10 text-destructive',
  minima: 'border-warning/40 bg-warning/10 text-warning',
  recomendada: 'border-success/40 bg-success/10 text-success',
  permitida: 'border-border bg-muted text-muted-foreground',
  maxima: 'border-border bg-muted text-muted-foreground',
};

/** Alturas oferecidas: as três da escala, mais o natural do bloco. */
const HEIGHTS: Array<{ key: string; label: string; px: number | null }> = [
  { key: 'auto', label: 'natural (piso da família)', px: null },
  { key: 'indicador', label: `indicador · ${HEIGHT.indicador}px`, px: HEIGHT.indicador },
  { key: 'conjunto', label: `conjunto · ${HEIGHT.conjunto}px`, px: HEIGHT.conjunto },
  { key: 'grafico', label: `gráfico · ${HEIGHT.grafico}px`, px: HEIGHT.grafico },
];

export function BlockExplorer({
  examples,
  resolved,
  loading,
  withoutMetric,
}: {
  examples: BlockExample[];
  resolved: Record<string, CanvasBlock>;
  loading: boolean;
  withoutMetric: Set<string>;
}) {
  const [chosen, setChosen] = useState(examples[0]?.block.id ?? '');
  const [height, setHeight] = useState('auto');
  const [showRejected, setShowRejected] = useState(true);

  const example = examples.find((e) => e.block.id === chosen) ?? examples[0];
  if (!example) return null;

  const base = resolved[example.block.id] ?? example.block;
  const spec = blockSpec(base.type);
  const range = widthOf(base.type, widthContextOf(base));
  const family: BlockFamily | undefined = blockFamilyOf(base as { type: string; display?: string });
  const chosenHeight = HEIGHTS.find((a) => a.key === height)?.px ?? null;

  const widths = ALL_WIDTHS.filter(
    (n) => showRejected || widthRole(n, range) !== 'recusada',
  );

  return (
    <div>
      {/* ── Controles ── */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-popover p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Bloco</span>
          <select
            aria-label="Bloco"
            className="h-9 min-w-[240px] rounded-md border border-border bg-background px-3 text-sm"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            {examples.map((e) => (
              <option key={e.block.id} value={e.block.id}>
                {e.block.type}
                {(e.block as { display?: string }).display ? ` · ${(e.block as { display?: string }).display}` : ''}
                {(e.block as { chartType?: string }).chartType ? ` · ${(e.block as { chartType?: string }).chartType}` : ''}
                {e.realData ? '' : ' (sem métrica)'}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Altura imposta</span>
          <select
            aria-label="Altura imposta"
            className="h-9 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          >
            {HEIGHTS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
          />
          Mostrar as larguras que o contrato recusa
        </label>
      </div>

      {/* ── Ficha do contrato ── */}
      <p className="mt-3 text-xs text-muted-foreground">
        <strong className="text-foreground">{spec.label}</strong> · aceita{' '}
        {spec.accepts.length ? spec.accepts.join(', ') : 'nenhuma forma de métrica'} · largura{' '}
        {range.min}–{range.max}, recomendada {range.recommended} ·{' '}
        {family ? `piso ${HEIGHT[family]}px` : 'sem piso de altura'}
      </p>
      <p className="mt-1 max-w-[80ch] text-xs italic text-muted-foreground/70">
        {spec.widthRationale}
      </p>

      {/* ── Uma largura por linha ── */}
      <div className="mt-6 space-y-7">
        {widths.map((n) => {
          const role = widthRole(n, range);
          const block = { ...base, colSpan: n } as CanvasBlock;
          return (
            <div key={n}>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{n}/6</span>
                <span className={cn(
                  'rounded-full border px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide',
                  ROLE_INK[role],
                )}>
                  {ROLE_LABEL[role]}
                </span>
                <span className="text-[11px] text-muted-foreground/60">
                  ≈ {Math.round((880 - (6 - n) * 16) * (n / 6))}px úteis
                </span>
              </div>
              <div className={cn('grid grid-cols-6 gap-4', role === 'recusada' && 'opacity-70')}>
                <div className={COL_SPAN_CLASS[n]}>
                  <div style={chosenHeight ? { minHeight: chosenHeight } : undefined} className="h-full">
                    <CanvasBlockRenderer
                      block={block}
                      loading={loading && !withoutMetric.has(block.id)}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
