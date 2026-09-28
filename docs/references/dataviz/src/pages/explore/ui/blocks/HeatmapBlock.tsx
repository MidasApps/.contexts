'use client';

import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell } from 'recharts';
import { cn } from '@/shared/lib/utils';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE, CHART_INK_CLASS } from '@/shared/config/chart-theme';
import type { HeatmapBlock as HeatmapBlockType } from '@/shared/config/agents/types';
import { BlockEmpty } from './block-shell';
import { formattedValue } from './formatted-value';

/**
 * Matriz de intensidade: linha × coluna → valor.
 *
 * A leitura de safra (originação × meses decorridos) é o diagnóstico clássico
 * de carteira de crédito — mostra se a inadimplência está piorando por safra
 * nova ou apenas envelhecendo — e não tinha como sair de uma tabela, onde a
 * diagonal que conta a história é invisível.
 *
 * O desenho é um `<ScatterChart>` de eixos categóricos com forma quadrada: é a
 * construção de heatmap que o Recharts suporta, e traz eixo, tooltip e
 * animação da mesma biblioteca que os outros gráficos. A primeira versão era
 * uma `<table>` com opacidade — acessível, mas o único bloco do produto sem
 * tooltip nem eixo desenhado pela lib.
 *
 * **Célula ausente não é desenhada.** Numa matriz de safra a diferença entre
 * "a safra de 2026 ainda não tem 18 meses" e "tem 18 meses e a inadimplência é
 * zero" é o ponto todo; pintar as duas de verde inverteria a conclusão.
 */

/** Ordem de aparição nos dados — o resolver já entrega ordenado por ORDER BY. */
function axesInDataOrder(cells: NonNullable<HeatmapBlockType['cells']>) {
  const rows: string[] = [];
  const columns: string[] = [];
  for (const c of cells) {
    if (!rows.includes(c.row)) rows.push(c.row);
    if (!columns.includes(c.col)) columns.push(c.col);
  }
  return { rows, columns };
}

export function HeatmapBlock({
  block,
  height = 240,
}: {
  block: HeatmapBlockType;
  height?: number | string;
}) {
  const cells = block.cells ?? [];
  if (cells.length === 0) return <BlockEmpty height={height} />;

  const { rows, columns } = axesInDataOrder(cells);
  const values = cells.map((c) => c.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const amplitude = max - min;
  const bad = block.highIsBad ?? true;
  const format = (v: number) => formattedValue(v, block.format, block.decimals);

  /*
   * A intensidade é opacidade sobre uma tinta única, e não uma escala de matiz.
   * Escala de matiz (verde→amarelo→vermelho) exige que o leitor decore a
   * legenda e é a primeira coisa que quebra em daltonismo; opacidade sobre uma
   * tinta só se lê por ordenação, que é o que a matriz pede. O piso de 0,1
   * mantém a célula mais fraca distinguível do fundo.
   */
  const intensity = (v: number) =>
    amplitude === 0 ? 0.5 : 0.1 + ((v - min) / amplitude) * 0.75;

  // O Recharts posiciona por índice nos eixos categóricos; o rótulo volta pelo
  // formatter. Passar a string direto faz o eixo reordenar alfabeticamente e a
  // safra de 2026 aparecer antes da de 2024.
  const points = cells.map((c) => ({
    x: columns.indexOf(c.col),
    y: rows.indexOf(c.row),
    valor: c.value,
    linha: c.row,
    coluna: c.col,
  }));

  /*
   * O tamanho da célula sai do container, não de um número fixo.
   *
   * A primeira versão passava `range={[900, 900]}` — área constante —, então a
   * matriz desenhava os mesmos quadradinhos de ~30px qualquer que fosse o
   * espaço: numa linha esticada sobravam 200px em branco embaixo, e em 6/6
   * sobrava metade da largura. O `ZAxis` do Recharts mapeia o terceiro canal
   * para ÁREA, então a conta é a área da célula disponível, com um respiro de
   * 12% para as células não se encostarem.
   */
  const MARGINS = { top: 8, right: 12, bottom: 4, left: 4 };
  const Y_AXIS_WIDTH = 56;
  const X_AXIS_HEIGHT = 22;

  const cellArea = (w: number, h: number) => {
    const usable = {
      width: Math.max(w - Y_AXIS_WIDTH - MARGINS.right - MARGINS.left, 10),
      height: Math.max(h - X_AXIS_HEIGHT - MARGINS.top - MARGINS.bottom, 10),
    };
    const side = {
      x: usable.width / Math.max(columns.length, 1),
      y: usable.height / Math.max(rows.length, 1),
    };
    return Math.max(side.x * side.y * 0.88, 24);
  };

  return (
    <div className={cn('h-full w-full', CHART_INK_CLASS)}>
      <ChartSizer height={height}>
        {(w, h) => (
          <ScatterChart width={w} height={h} margin={MARGINS}>
            <XAxis
              type="number"
              dataKey="x"
              domain={[-0.5, columns.length - 0.5]}
              ticks={columns.map((_, i) => i)}
              tickFormatter={(i: number) => columns[i] ?? ''}
              interval={0}
              {...CHART_AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              name={block.colLabel ?? 'coluna'}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[-0.5, rows.length - 0.5]}
              ticks={rows.map((_, i) => i)}
              tickFormatter={(i: number) => rows[i] ?? ''}
              interval={0}
              width={Y_AXIS_WIDTH}
              reversed
              {...CHART_AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              name={block.rowLabel ?? 'linha'}
            />
            {/* Sem ZAxis o Recharts normaliza todos os pontos para o raio
                mínimo. Aqui ele recebe a área da célula calculada do espaço
                real, e a matriz preenche o container nas duas direções. */}
            <ZAxis type="number" range={[cellArea(w, h), cellArea(w, h)]} />
            <Tooltip
              {...CHART_TOOLTIP_STYLE}
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as { linha: string; coluna: string; valor: number };
                return (
                  <div style={CHART_TOOLTIP_STYLE.contentStyle}>
                    <div style={CHART_TOOLTIP_STYLE.labelStyle}>{`${p.linha} · ${p.coluna}`}</div>
                    <div>{format(p.valor)}</div>
                  </div>
                );
              }}
            />
            <Scatter
              data={points}
              shape="square"
              isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
              name={block.title ?? 'Matriz'}
            >
              {points.map((p) => (
                <Cell
                  key={`${p.linha}-${p.coluna}`}
                  className={bad ? 'fill-destructive' : 'fill-success'}
                  fillOpacity={intensity(p.valor)}
                />
              ))}
            </Scatter>
          </ScatterChart>
        )}
      </ChartSizer>
    </div>
  );
}
