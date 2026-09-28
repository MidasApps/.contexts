'use client';

import { Sankey, Tooltip } from 'recharts';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { CHART_TOOLTIP_STYLE, CHART_INK_CLASS } from '@/shared/config/chart-theme';
import { cn } from '@/shared/lib/utils';
import type { SankeyBlock as SankeyBlockType } from '@/shared/config/agents/types';
import { formattedValue } from './formatted-value';

/**
 * Matriz de migração entre dois períodos.
 *
 * Quem estava em 1–30 dias de atraso e foi para 31–60. É a leitura que
 * ANTECIPA a inadimplência — o estoque só mostra o resultado depois de
 * consumado.
 *
 * **A cor comunica a DIREÇÃO, não o estado de origem.** É o ponto inteiro do
 * bloco: quem piorou, quem melhorou, quem ficou. Pintar tudo de uma cor só
 * transforma a migração em fitas anônimas e devolve ao leitor o trabalho que o
 * desenho deveria poupar. Quem ficou é o volume maior e a notícia menor, então
 * recua para as migrações aparecerem.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseProps = any;

const STROKE = {
  piorou: 'stroke-destructive',
  melhorou: 'stroke-success',
  mantido: 'stroke-muted-foreground',
} as const;

type Direction = keyof typeof STROKE;

function directionOf(origem: number, destino: number): Direction {
  if (origem < 0 || destino < 0) return 'mantido';
  if (destino > origem) return 'piorou';
  if (destino < origem) return 'melhorou';
  return 'mantido';
}

export function SankeyBlock({
  block,
  height = '100%',
}: {
  block: SankeyBlockType;
  height?: number | string;
}) {
  const fluxos = block.fluxos ?? [];
  const format = (v: number) => formattedValue(v, block.format);

  /*
   * A ordem de gravidade decide o que é piora. Declarada, ela manda; ausente,
   * cai na ordem de aparição — que só acerta se o SQL já vier ordenado, e por
   * isso o contrato pede `ordem` explicitamente.
   */
  const ordem = block.ordem?.length
    ? block.ordem
    : [...new Set(fluxos.flatMap((f) => [f.origem, f.destino]))];

  // Dez nós: os N primeiros são o período anterior, os N últimos o atual. O
  // Recharts identifica nó por índice, então o mesmo nome aparece dos dois
  // lados — é o mesmo estado, em dois momentos.
  const nodes = [...ordem, ...ordem].map((name) => ({ name }));
  const links = fluxos.flatMap((f) => {
    const origem = ordem.indexOf(f.origem);
    const destino = ordem.indexOf(f.destino);
    if (origem < 0 || destino < 0) return [];
    return [{ source: origem, target: ordem.length + destino, value: f.value }];
  });

  function MigrationLink(props: LooseProps) {
    const {
      sourceX, sourceY, sourceControlX, targetControlX, targetX, targetY, linkWidth, payload,
    } = props;
    const o = ordem.indexOf(payload?.source?.name);
    const d = ordem.indexOf(payload?.target?.name);
    const dir = directionOf(o, d);
    return (
      <path
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        strokeWidth={linkWidth}
        strokeOpacity={dir === 'mantido' ? 0.16 : 0.5}
        className={STROKE[dir]}
      />
    );
  }

  function No(props: LooseProps) {
    const { x, y, width, height: nodeHeight, index, payload } = props;
    const onLeft = index < ordem.length;
    return (
      <g>
        <rect x={x} y={y} width={width} height={nodeHeight} className="fill-muted-foreground" fillOpacity={0.55} />
        <text
          x={onLeft ? x - 8 : x + width + 8}
          y={y + nodeHeight / 2}
          textAnchor={onLeft ? 'end' : 'start'}
          dominantBaseline="middle"
          fontSize={11}
          fill="currentColor"
        >
          {`${payload.name} · ${format(payload.value)}`}
        </text>
      </g>
    );
  }

  return (
    <div className={cn('h-full w-full', CHART_INK_CLASS)}>
      <ChartSizer height={height}>
        {(w, h) => (
          <Sankey
            width={w} height={h} data={{ nodes, links }}
            nodePadding={16} nodeWidth={10}
            /* A coluna de rótulos acompanha a largura: com 96px fixos, "Sem
               atraso · 3.026" era cortado no meio e virava "em atraso". */
            margin={{
              top: 10, bottom: 10,
              left: Math.max(96, Math.min(220, w * 0.18)),
              right: Math.max(96, Math.min(220, w * 0.18)),
            }}
            link={<MigrationLink />}
            node={<No />}
          >
            <Tooltip
              {...({
                ...CHART_TOOLTIP_STYLE,
                /*
                 * O tooltip padrão do Sankey nomeia a fita como "1-30 - 1-30":
                 * o hífen de subtração no meio de faixas que JÁ têm hífen, sem
                 * dizer o que é origem e o que é destino. E o `source` do
                 * payload é o ÍNDICE do nó, não o nó — daí resolver pelo array
                 * de nós, que é o mesmo que alimenta o desenho.
                 */
                content: ({ active, payload }: LooseProps) => {
                  if (!active || !payload?.length) return null;
                  // O item traz `{ payload: <fita>, name, value }` — a fita
                  // está um nível ABAIXO do que a convenção do Recharts sugere,
                  // e é nela que moram origem e destino.
                  const p = payload[0]?.payload ?? {};
                  const ribbon = p.payload ?? {};
                  const name = (i: unknown) =>
                    typeof i === 'number' ? nodes[i]?.name : (i as { name?: string })?.name;
                  const origem = name(ribbon.source);
                  const destino = name(ribbon.target);
                  const value = Number(ribbon.value ?? p.value ?? payload[0]?.value ?? 0);
                  const migrated = Boolean(origem && destino);
                  return (
                    <div style={CHART_TOOLTIP_STYLE.contentStyle}>
                      <div style={CHART_TOOLTIP_STYLE.labelStyle}>
                        {migrated ? `${origem} → ${destino}` : (p.name ?? '')}
                      </div>
                      <div style={{ fontVariantNumeric: 'tabular-nums' }}>{format(value)}</div>
                      {migrated && origem !== destino && (
                        <div style={{ color: 'var(--color-muted-foreground)', marginTop: '3px' }}>
                          {ordem.indexOf(destino!) > ordem.indexOf(origem!) ? 'piorou' : 'melhorou'}
                        </div>
                      )}
                    </div>
                  );
                },
              } as LooseProps)}
            />
          </Sankey>
        )}
      </ChartSizer>
    </div>
  );
}
