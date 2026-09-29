'use client';

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, Cell,
} from 'recharts';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import {
  CHART_COLORS, seriesColor, CHART_AXIS_STYLE, CHART_GRID_STYLE,
  CHART_TOOLTIP_STYLE, CHART_LEGEND_STYLE, CHART_INK_CLASS,
} from '@/shared/config/chart-theme';
import { useId, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { formatNumber, formatMonthLabel, humanizeColumnName } from '@/shared/lib/format';
import type { ChartBlock as ChartBlockType } from '@/shared/config/agents/types';
import { toWaterfallData } from './waterfall';
import { COMPARISON_PREFIX, COMPARISON_LABEL } from '@/shared/hooks/useReportData';
import { formattedValue, compactValue } from './formatted-value';
import { tooltipContent } from './SeriesTooltip';

/**
 * Teto de largura da barra.
 *
 * O Recharts reparte a largura do eixo entre as categorias e não impõe limite:
 * um gráfico com duas categorias desenha duas barras ocupando metade do card
 * cada. Lê-se como defeito, não como dado.
 */
const MAX_BAR_WIDTH = 72;

function getColor(colors: string[] | undefined, index: number): string {
  if (colors?.[index]) return colors[index];
  return seriesColor(index);
}

/** Detect if xAxisKey values look like YYYY-MM dates */
function isMonthAxis(data: Record<string, unknown>[], xAxisKey: string): boolean {
  const first = data[0]?.[xAxisKey];
  return typeof first === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(first);
}

/**
 * Tooltip do waterfall: ignora as séries internas `base`/`delta` e exibe o
 * `value` (com sinal) do bucket, que é o dado de negócio real.
 */
function WaterfallTooltipContent(props: {
  active?: boolean;
  // Payload do Recharts vem com tipagem genérica própria (readonly, campos
  // extras); extraímos só bucket/value do dado original de cada item.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
  label?: unknown;
  monthAxis: boolean;
  format: (value: number) => string;
}) {
  const { active, payload, label, monthAxis, format } = props;
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { bucket: string; value: number };
  return (
    <div style={CHART_TOOLTIP_STYLE.contentStyle}>
      <div style={CHART_TOOLTIP_STYLE.labelStyle}>
        {monthAxis ? formatMonthLabel(String(label)) : String(label)}
      </div>
      <div style={{ fontVariantNumeric: 'tabular-nums' }}>{format(row.value)}</div>
    </div>
  );
}

/**
 * A chave de comparação entre um ponto real e um projetado.
 *
 * Meses chegam em formatos diferentes dos dois lados: a métrica devolve o
 * `DATE_TRUNC` do BigQuery (`2026-06-01`) e o assistente escreve o mês
 * (`2026-06`). Ambos viram "jun/26" na tela, então a duplicata era invisível
 * na origem e evidente no eixo. Comparar por ano-mês resolve sem exigir que os
 * dois lados combinem formato.
 */
function axisKey(value: unknown): string {
  const text = String(value ?? '');
  const month = /^(\d{4})-(\d{2})/.exec(text);
  return month ? `${month[1]}-${month[2]}` : text;
}

/** Histórico + projeção, com o ponto de emenda numa linha só. */
export function mergeProjection(
  history: Array<Record<string, string | number>> | undefined,
  projection: Array<Record<string, string | number>> | undefined,
  xAxisKey: string,
): Array<Record<string, string | number>> | undefined {
  if (!projection?.length) return history;

  const rows = (history ?? []).map((l) => ({ ...l }));
  const positionByMonth = new Map<string, number>();
  rows.forEach((row, i) => positionByMonth.set(axisKey(row[xAxisKey]), i));

  for (const point of projection) {
    const key = axisKey(point[xAxisKey]);
    const position = positionByMonth.get(key);
    if (position === undefined) {
      rows.push({ ...point });
      positionByMonth.set(key, rows.length - 1);
    } else {
      // O eixo mantém o valor do HISTÓRICO: é ele que a métrica devolveu, e
      // trocá-lo pelo formato do assistente mudaria o rótulo do ponto.
      const { [xAxisKey]: _discarded, ...rest } = point;
      rows[position] = { ...rows[position]!, ...rest };
    }
  }
  return rows;
}

export function ChartBlock({
  block,
  height = 340,
}: {
  block: ChartBlockType;
  /**
   * Altura da área de plotagem. `'100%'` para preencher um container de altura
   * definida — é o que o modal usa.
   *
   * O modal já clonava o filho passando `height: '100%'`, mas este componente
   * não aceitava a prop: o gráfico ficava em 340px tanto no card quanto no
   * modal, e "expandir" nunca ampliou coisa alguma.
   */
  height?: number | string;
}) {
  const { chartType, dataKeys, xAxisKey, colors, dashedKeys, referenceLines } = block;
  const isDashed = (key: string) => Array.isArray(dashedKeys) && dashedKeys.includes(key);

  /*
   * Prefixo dos gradientes de área.
   *
   * `id` de `<defs>` é global no DOCUMENTO, não no SVG: duas áreas na mesma
   * página com `id="grad-0"` fariam a segunda pintar com o gradiente da
   * primeira. O `useId` dá o prefixo único por instância — sem os dois-pontos
   * que ele traz, que quebrariam o `url(#…)`.
   */
  const gradientId = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  /*
   * Legenda clicável — esconde SÉRIE, nunca período.
   *
   * Com cinco faixas num empilhado, isolar uma é a diferença entre legível e
   * ilegível. Veio junto de uma proposta de `<Brush>` que foi descartada: o
   * filtro de período é global e muda o que é BUSCADO; um recorte por gráfico
   * criaria duas verdades sobre o período na mesma tela.
   */
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSeries = (key: string) => {
    setHiddenSeries((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const legendProps = block.legendaInterativa
    ? {
        onClick: (e: { dataKey?: unknown }) => toggleSeries(String(e.dataKey)),
        // O cursor é o que ANUNCIA que a legenda responde; sem ele a interação
        // existe e ninguém descobre.
        wrapperStyle: { ...CHART_LEGEND_STYLE.wrapperStyle, cursor: 'pointer' },
      }
    : {};
  const isHidden = (key: string) => hiddenSeries.has(key);

  /*
   * Pareto: barras ordenadas do maior ao menor mais a curva do acumulado.
   *
   * A ordenação e a série derivada são calculadas aqui, e não no SQL, porque
   * são propriedades do DESENHO: a mesma métrica `breakdown` alimenta uma
   * barra comum sem ordem nenhuma.
   */
  /*
   * Histórico e projeção na MESMA linha quando falam do mesmo mês.
   *
   * A composição é aqui, e não no pipeline de dados, porque só um dos dois
   * lados vem de consulta: `data` é preenchido pela métrica e `projectedData`
   * já veio gravado no bloco. Fazer a junção no pipeline deixaria de fora
   * justamente o gráfico que só tem projeção — o que nunca chega a buscar
   * nada.
   *
   * Concatenar não bastava. O ponto de emenda (o último mês real, repetido na
   * série projetada) virava uma SEGUNDA linha com o mesmo mês: o eixo mostrava
   * "jun/26 jun/26" e as duas curvas ficavam desconectadas, porque em nenhuma
   * linha as duas séries tinham valor ao mesmo tempo. Mesclando por mês, a
   * emenda existe de verdade — um único ponto onde a linha cheia termina e a
   * tracejada começa.
   */
  const series = mergeProjection(block.data, block.projectedData, xAxisKey);

  const data = chartType === 'pareto' && series?.length
    ? (() => {
        const key = dataKeys?.[0] ?? 'value';
        const sorted = [...series!].sort((a, b) => Number(b[key]) - Number(a[key]));
        const total = sorted.reduce((sum, l) => sum + Number(l[key] || 0), 0);
        let cumulative = 0;
        return sorted.map((row) => {
          cumulative += Number(row[key] || 0);
          return { ...row, __acumulado: total > 0 ? (cumulative / total) * 100 : 0 };
        });
      })()
    : series;

  /*
   * ─── Eixo Y duplo ───
   *
   * O gráfico tinha UM eixo de valores, e o `composed` existe justamente para
   * combinar grandezas diferentes: saldo em reais com taxa em percentual. Numa
   * escala só, a linha de 4,8% desenha colada no zero de uma escala que vai a
   * 60 milhões — presente na tela, ilegível como informação. É a combinação que
   * o produto mais pede e a que menos funcionava.
   *
   * Só entra quando o bloco declara `rightAxisKeys`; sem isso o gráfico segue
   * com eixo único e `yAxisId` fica ausente, preservando o comportamento
   * anterior byte a byte. Séries declaradas que não existem em `dataKeys` são
   * ignoradas — declarar o eixo não inventa a série.
   */
  const onRightAxis = (block.rightAxisKeys ?? []).filter((k) => dataKeys?.includes(k));
  const hasDualAxis = onRightAxis.length > 0 && onRightAxis.length < (dataKeys?.length ?? 0);
  const seriesAxis = (key: string): 'left' | 'right' | undefined =>
    hasDualAxis ? (onRightAxis.includes(key) ? 'right' : 'left') : undefined;

  // Primeira coisa do componente: nada aqui embaixo tolera bloco sem série.
  // A guarda já existia, mas DEPOIS de `hasNegativeValues` — que lê
  // `data.some(...)`. Um bloco `chart` sem `data` (o que um update parcial da
  // IA produz ao errar o alvo) não desenhava vazio: derrubava a página inteira
  // no ErrorBoundary.
  if (!data?.length || !dataKeys?.length) {
    return (
      <div className="flex h-[340px] items-center justify-center text-[11px] text-muted-foreground/40 italic">
        Sem dados para exibir
      </div>
    );
  }

  /** Check if data contains any negative values (for bar charts with ± values) */
  const hasNegativeValues = data.some((row) =>
    dataKeys.some((key) => {
      const val = row[key];
      return typeof val === 'number' && val < 0;
    })
  );

  // Cor da linha de referência e do rótulo dela: `currentColor` herda a tinta
  // do wrapper (CHART_INK_CLASS) e troca com o tema. Cor explícita do bloco
  // continua valendo — é escolha de quem montou o gráfico, não default.
  const refLines = (referenceLines ?? []).map((rl, i) => (
    <ReferenceLine
      key={`ref-${i}`}
      // Com dois eixos o Recharts exige saber a qual deles a linha pertence;
      // sem o id ela não é desenhada — e falha em silêncio.
      yAxisId={hasDualAxis ? 'left' : undefined}
      y={rl.y}
      stroke={rl.color ?? 'currentColor'}
      strokeOpacity={rl.color ? undefined : 0.45}
      strokeDasharray={rl.dashed === false ? undefined : '4 4'}
      label={rl.label ? { value: rl.label, fill: 'currentColor', fontSize: 10, position: 'right' } : undefined}
    />
  ));

  const monthAxis = isMonthAxis(data, xAxisKey);

  const sharedAxisProps = {
    ...CHART_AXIS_STYLE,
    tickLine: false as const,
    axisLine: false as const,
  };

  const xAxisProps = {
    dataKey: xAxisKey,
    ...sharedAxisProps,
    ...(monthAxis ? { tickFormatter: formatMonthLabel } : {}),
  };

  /*
   * O eixo fala a mesma língua do tooltip.
   *
   * `formatYTick` abreviava com `toFixed`, que emite PONTO decimal: "2.0M" e
   * "500K" num produto que escreve "2,0 mi" em todo o resto — e sem nunca
   * dizer a unidade. `compactValue` é o mesmo abreviador do donut e do KPI.
   *
   * Moeda é a exceção: "R$" em CADA marca é a mesma palavra repetida cinco
   * vezes na vertical, e no eixo duplo ela ainda colidia com o rótulo "R$" do
   * próprio eixo. A unidade aparece uma vez, no rótulo — que é o lugar dela.
   */
  const formatTick = (v: number) =>
    compactValue(v, block.format === 'currency' ? 'number' : block.format, block.decimals);

  /** O rótulo do eixo: o declarado, ou a unidade quando o bloco a declara. */
  const axisLabel = (side: 'left' | 'right'): string | undefined => {
    const declared = side === 'left' ? block.leftAxisLabel : block.rightAxisLabel;
    if (declared) return declared;
    const format = side === 'right' ? (block.rightFormat ?? block.format) : block.format;
    return format === 'currency' ? 'R$' : undefined;
  };

  const label = (side: 'left' | 'right', position: 'insideTopLeft' | 'insideTopRight') => {
    const value = axisLabel(side);
    return value
      ? { value, position, fill: 'currentColor', fontSize: 10, offset: -2 } as const
      : undefined;
  };

  const yAxisProps = {
    ...sharedAxisProps,
    tickFormatter: formatTick,
  };

  /**
   * Os eixos de valor: um, ou dois quando `rightAxisKeys` está declarado.
   *
   * O Recharts exige que `yAxisId` case entre eixo e série — id sem eixo
   * correspondente faz a série sumir sem erro no console.
   */
  const valueAxes = hasDualAxis
    ? (
        <>
          <YAxis yAxisId="left" {...yAxisProps} label={label('left', 'insideTopLeft')} />
          <YAxis yAxisId="right" orientation="right" {...yAxisProps} label={label('right', 'insideTopRight')} />
        </>
      )
    : <YAxis {...yAxisProps} label={label('left', 'insideTopLeft')} />;

  // stacked-bar 100% (Fase R/B4): recharts normaliza as barras p/ 0..1; eixo em %.
  const isExpand = chartType === 'stacked-bar' && block.stackOffset === 'expand';
  const expandYAxisProps = {
    ...sharedAxisProps,
    domain: [0, 1] as [number, number],
    tickFormatter: (v: number) => `${Math.round(v * 100)}%`,
  };

  // Layout horizontal (G2, Fase 1): categoria no eixo Y, valores no eixo X.
  // Só se aplica a bar/stacked-bar — Recharts usa layout="vertical" no
  // <BarChart> p/ essa orientação (nomenclatura invertida da lib).
  const isHorizontal = (chartType === 'bar' || chartType === 'stacked-bar') && block.layout === 'horizontal';

  /** Add zero line for bar charts with negative values (G6: Entradas & Saídas)
   * Em layout horizontal, o eixo de valores é X; em vertical, é Y.
   */
  const zeroLine = (chartType === 'bar' || chartType === 'stacked-bar') && hasNegativeValues
    ? isHorizontal
      ? <ReferenceLine key="zero-line" x={0} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="0" />
      : <ReferenceLine key="zero-line" yAxisId={hasDualAxis ? 'left' : undefined} y={0} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="0" />
    : null;

  const horizontalValueAxisProps = {
    ...sharedAxisProps,
    ...(isExpand
      ? { domain: [0, 1] as [number, number], tickFormatter: (v: number) => `${Math.round(v * 100)}%` }
      : { tickFormatter: formatTick }),
  };

  const horizontalCategoryAxisProps = {
    dataKey: xAxisKey,
    ...sharedAxisProps,
    ...(monthAxis ? { tickFormatter: formatMonthLabel } : {}),
  };

  /**
   * O número de uma série, na unidade que o BLOCO declara.
   *
   * Era `formatTooltipValue`, que escolhia a unidade pela grandeza: acima de
   * mil, moeda. Num gráfico de contratos o tooltip afirmava "R$ 1.200,00" — a
   * tela inventava reais onde havia contagem. Sem `format` declarado, número
   * puro: não saber a unidade é um estado honesto; chutá-la não.
   */
  const formatSeries = (value: number, key: string): string => {
    // A curva do Pareto é percentual e não vem de coluna do dado — não segue o
    // formato das barras.
    if (key === '__acumulado') return `${formatNumber(value, 1)}%`;
    // A série comparativa é a MESMA grandeza da que ela espelha: precisa da
    // mesma unidade, inclusive quando a original vive no eixo direito.
    const original = key.startsWith(COMPARISON_PREFIX)
      ? key.slice(COMPARISON_PREFIX.length)
      : key;
    const onRight = hasDualAxis && onRightAxis.includes(original);
    const format = onRight ? (block.rightFormat ?? block.format) : block.format;
    const decimals = onRight ? (block.rightDecimals ?? block.decimals) : block.decimals;
    return formattedValue(value, format, decimals ?? 0);
  };

  /*
   * ─── A sobreposição de dois períodos ───
   *
   * O dado do comparativo vem em colunas `__cmp_<série>`, alinhadas por
   * POSIÇÃO com as do período atual (ver `mergeComparisonSeries`): mai–jul
   * contra jan–mar não tem nenhum ponto de eixo em comum, então o que se
   * compara é o percurso — 1º mês contra 1º mês.
   *
   * O desenho de lá é sempre TRACEJADO e esmaecido, na mesma cor da série que
   * ele espelha. Cor diferente diria "outra grandeza"; a mesma cor com traço
   * interrompido diz "a mesma coisa, noutro tempo" — que é o fato.
   */
  const hasComparison = (key: string) =>
    data.some((row) => row[`${COMPARISON_PREFIX}${key}`] !== undefined);

  /*
   * A legenda aparecia só com duas séries ou mais. Com o comparativo ligado,
   * um gráfico de série única passa a ter DUAS curvas — e a tracejada ficaria
   * sem explicação nenhuma na tela.
   */
  const showsLegend = dataKeys.length > 1 || dataKeys.some(hasComparison);

  /*
   * A série comparativa só se apresenta na legenda quando há POUCAS séries.
   * Num empilhado de cinco faixas ela dobrava a legenda para dez itens e três
   * linhas, empurrando a área de plotagem para cima — e sem acrescentar nada,
   * porque é a mesma faixa num tom mais claro, e o tooltip já a nomeia. Com
   * uma ou duas séries vale o oposto: sem o item, o tracejado apareceria sem
   * explicação nenhuma.
   */
  const namesComparisonInLegend = dataKeys.length <= 2;
  const comparisonLegend = namesComparisonInLegend
    ? {}
    : { legendType: 'none' as const };

  const comparisonLines = (shape: 'line' | 'area' | 'bar') => {
    // Cascata, histograma e pareto ficam de fora: nos três a ordem ou a
    // derivação do desenho é do próprio período (o acumulado do pareto, a
    // base empilhada da cascata, as faixas do histograma), e duplicá-la
    // produziria duas verdades sobre o mesmo eixo. Empilhado e composed têm
    // tratamento próprio, na sua ramificação.
    return dataKeys.flatMap((key, i) => {
      if (!hasComparison(key)) return [];
      const color = getColor(colors, i);
      const dataKey = `${COMPARISON_PREFIX}${key}`;
      const name = `${humanizeColumnName(key)} (comparativo)`;
      const common = {
        hide: isHidden(key),
        yAxisId: seriesAxis(key),
        dataKey,
        name,
        isAnimationActive: RECHARTS_ANIMATION_ACTIVE,
        ...comparisonLegend,
      } as const;

      if (shape === 'bar') {
        return [
          <Bar
            key={dataKey} {...common} fill={color} fillOpacity={0.35}
            radius={isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
            maxBarSize={MAX_BAR_WIDTH}
          />,
        ];
      }
      if (shape === 'area') {
        return [
          <Area
            key={dataKey} {...common} type="monotone" stroke={color} strokeWidth={1.5}
            strokeDasharray="5 4" fill="none" dot={false}
          />,
        ];
      }
      return [
        <Line
          key={dataKey} {...common} type="monotone" stroke={color} strokeWidth={1.5}
          strokeDasharray="5 4" strokeOpacity={0.75}
          /* Ponto visível, ao contrário da série principal: quando o período
             comparativo é mais curto, sobram um ou dois pontos pareados — e
             uma linha de um ponto só não desenha nada. Sem o ponto, a legenda
             anunciava uma série que não aparecia em lugar nenhum. */
          dot={{ r: 2 }}
          activeDot={{ r: 3, strokeWidth: 2 }}
        />,
      ];
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipProps: any = {
    ...CHART_TOOLTIP_STYLE,
    content: tooltipContent({
      formatValue: formatSeries,
      // Empilhado: a soma é a altura da coluna, e é a pergunta seguinte de
      // quem leu as faixas. Nos demais, somar séries não significa nada — a
      // soma de um saldo com uma taxa não é grandeza nenhuma.
      showsTotal: chartType === 'stacked-bar' && block.stackOffset !== 'expand',
      topToBottom: chartType === 'stacked-bar',
      /*
       * As duas séries são alinhadas por POSIÇÃO, então o rótulo do eixo (o
       * mês atual) não descreve o ponto comparativo. Sem esta linha o leitor
       * vê dois números sob o mesmo mês e não tem como saber a que período o
       * tracejado pertence.
       */
      footer: (p: { payload?: Array<{ payload?: Record<string, unknown> }> }) => {
        const labelText = p.payload?.[0]?.payload?.[COMPARISON_LABEL];
        if (labelText === undefined || labelText === '') return null;
        const text = monthAxis ? formatMonthLabel(String(labelText)) : String(labelText);
        return `comparativo: ${text}`;
      },
      ...(monthAxis ? { formatLabel: (label: unknown) => formatMonthLabel(String(label)) } : {}),
    }),
  };

  // Waterfall (Fase 1, Extrato Resumido): base invisível acumulada + delta
  // visível colorido por sinal do value original.
  const waterfallData = chartType === 'waterfall'
    ? toWaterfallData(data as unknown as { bucket: string; value: number }[])
    : [];

  return (
    // `CHART_INK_CLASS` define o `color` que o `currentColor` dos nós SVG
    // (tick, grade, linha de referência, cursor) herda. Sem ele o gráfico
    // pegaria o `foreground` cheio do body e os eixos ficariam berrantes.
    <div className={cn('h-full w-full', CHART_INK_CLASS)}>
      <ChartSizer height={height}>
        {(w, h) => (chartType === 'bar' || chartType === 'histogram') ? (
          // Histograma é o mesmo BarChart com as barras encostadas e sem canto
          // arredondado: a leitura de uma DISTRIBUIÇÃO depende de as barras
          // formarem um contorno contínuo. Com o vão de 20% da barra comum, o
          // olho lê categorias separadas em vez de faixas de uma mesma escala.
          <BarChart
            width={w} height={h} data={data}
            barCategoryGap={chartType === 'histogram' ? '2%' : '20%'}
            layout={isHorizontal ? 'vertical' : undefined}
          >
            <CartesianGrid {...CHART_GRID_STYLE} />
            {isHorizontal ? (
              <>
                <XAxis type="number" {...horizontalValueAxisProps} />
                <YAxis type="category" width={120} {...horizontalCategoryAxisProps} />
              </>
            ) : (
              <>
                <XAxis {...xAxisProps} />
                {valueAxes}
              </>
            )}
            <Tooltip {...tooltipProps} />
            {refLines}
            {zeroLine}
            {showsLegend && <Legend {...CHART_LEGEND_STYLE} {...legendProps} />}
            {dataKeys.map((key, i) => (
              <Bar
                key={key}
                hide={isHidden(key)}
                yAxisId={seriesAxis(key)}
                dataKey={key}
                name={humanizeColumnName(key)}
                fill={getColor(colors, i)}
                radius={chartType === 'histogram' ? [2, 2, 0, 0] : isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
                /* Teto de largura. O Recharts reparte o eixo entre as
                   categorias e não limita nada: com duas categorias, saem duas
                   barras da largura do card, que parecem bug e não dado. O
                   histograma é a exceção — ali as barras encostadas SÃO a
                   leitura da distribuição. */
                maxBarSize={chartType === 'histogram' ? undefined : MAX_BAR_WIDTH}
                isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
              />
            ))}
            {comparisonLines('bar')}
          </BarChart>
        ) : chartType === 'stacked-bar' ? (
          <BarChart width={w} height={h} data={data} barCategoryGap="20%" stackOffset={isExpand ? 'expand' : undefined} layout={isHorizontal ? 'vertical' : undefined}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            {isHorizontal ? (
              <>
                <XAxis type="number" {...horizontalValueAxisProps} />
                <YAxis type="category" width={120} {...horizontalCategoryAxisProps} />
              </>
            ) : (
              <>
                <XAxis {...xAxisProps} />
                <YAxis {...(isExpand ? expandYAxisProps : yAxisProps)} />
              </>
            )}
            <Tooltip {...tooltipProps} />
            {refLines}
            {zeroLine}
            <Legend {...CHART_LEGEND_STYLE} {...legendProps} />
            {dataKeys.map((key, i) => (
              <Bar
                key={key}
                hide={isHidden(key)}
                dataKey={key}
                name={humanizeColumnName(key)}
                stackId="stack"
                fill={getColor(colors, i)}
                maxBarSize={MAX_BAR_WIDTH}
                radius={i === dataKeys.length - 1 ? (isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]) : [0, 0, 0, 0]}
                isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
              />
            ))}
            {/* Empilhado ganha uma SEGUNDA pilha, ao lado — não uma
                sobreposição por cima. `stackId` diferente faz o Recharts
                desenhar as duas colunas lado a lado, e cada uma soma o seu
                próprio período: a altura continua sendo o total daquele mês,
                que é a leitura do empilhado. Uma fita fantasma somada à pilha
                existente quebraria justamente isso. */}
            {dataKeys.flatMap((key, i) => (
              hasComparison(key)
                ? [(
                    <Bar
                      key={`${COMPARISON_PREFIX}${key}`}
                      hide={isHidden(key)}
                      dataKey={`${COMPARISON_PREFIX}${key}`}
                      name={`${humanizeColumnName(key)} (comparativo)`}
                      stackId="comparativo"
                      {...comparisonLegend}
                      fill={getColor(colors, i)}
                      fillOpacity={0.45}
                      maxBarSize={MAX_BAR_WIDTH}
                      radius={i === dataKeys.length - 1 ? (isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]) : [0, 0, 0, 0]}
                      isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                    />
                  )]
                : []
            ))}
          </BarChart>
        ) : chartType === 'line' ? (
          <LineChart width={w} height={h} data={data}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis {...xAxisProps} />
            {valueAxes}
            <Tooltip {...tooltipProps} />
            {refLines}
            {showsLegend && <Legend {...CHART_LEGEND_STYLE} {...legendProps} />}
            {dataKeys.map((key, i) => (
              <Line
                key={key}
                hide={isHidden(key)}
                yAxisId={seriesAxis(key)}
                type="monotone"
                dataKey={key}
                name={humanizeColumnName(key)}
                stroke={getColor(colors, i)}
                strokeWidth={2}
                strokeDasharray={isDashed(key) ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
              />
            ))}
            {comparisonLines('line')}
          </LineChart>
        ) : chartType === 'area' ? (
          <AreaChart width={w} height={h} data={data}>
            {/* O preenchimento desce até quase zero na base: a área existe para
                dar peso à curva, não para tapar a grade embaixo dela. */}
            <defs>
              {dataKeys.map((key, i) => (
                <linearGradient key={key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={getColor(colors, i)} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={getColor(colors, i)} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis {...xAxisProps} />
            {valueAxes}
            <Tooltip {...tooltipProps} />
            {refLines}
            {showsLegend && <Legend {...CHART_LEGEND_STYLE} {...legendProps} />}
            {dataKeys.map((key, i) => {
              const color = getColor(colors, i);
              return (
                <Area
                  key={key}
                  hide={isHidden(key)}
                  yAxisId={seriesAxis(key)}
                  type="monotone"
                  dataKey={key}
                  name={humanizeColumnName(key)}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={isDashed(key) ? '5 4' : undefined}
                  fill={`url(#${gradientId}-${i})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                />
              );
            })}
            {comparisonLines('area')}
          </AreaChart>
        ) : chartType === 'waterfall' ? (
          <BarChart width={w} height={h} data={waterfallData} barCategoryGap="20%">
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip
              cursor={CHART_TOOLTIP_STYLE.cursor}
              content={(props) => (
                <WaterfallTooltipContent
                  {...props} monthAxis={monthAxis}
                  format={(v) => formatSeries(v, dataKeys[0] ?? 'value')}
                />
              )}
            />
            {refLines}
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="delta" stackId="w" radius={[6, 6, 0, 0]} maxBarSize={MAX_BAR_WIDTH} isAnimationActive={RECHARTS_ANIMATION_ACTIVE}>
              {waterfallData.map((row, i) => (
                /* Queda usa `negativo`, um token PRÓPRIO — nem o vermelho de
                   ação (`destructive` é o do "Excluir"), nem um slot da
                   paleta: emprestar o categórico faria a cor do negativo
                   mudar junto com a paleta, e uma série qualquer nasceria
                   marcada sem ter caído.
                   Classe, não atributo: `fill="var(--token)"` não resolve em
                   SVG (ver a nota de tema no `chart-theme`). */
                <Cell
                  key={`cell-${i}`}
                  className={row.value >= 0 ? undefined : 'fill-negativo'}
                  fill={row.value >= 0 ? CHART_COLORS.primary : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        ) : chartType === 'pareto' ? (
          /* A margem do topo é do último ponto do acumulado: ele vale sempre
             100%, e sem folga o marcador fica cortado pela borda da área de
             plotagem — a curva parece terminar em cima da linha, não nela. */
          <ComposedChart width={w} height={h} data={data} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            {/* Rótulo inclinado: categoria de Pareto costuma ser nome longo, e
                na horizontal ele some ou empurra as barras. */}
            <XAxis {...xAxisProps} interval={0} angle={-20} textAnchor="end" height={54} />
            <YAxis yAxisId="left" {...yAxisProps} />
            <YAxis
              yAxisId="right" orientation="right" {...sharedAxisProps}
              domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip {...tooltipProps} />
            {refLines}
            <Bar
              yAxisId="left" dataKey={dataKeys[0] ?? 'value'}
              name={humanizeColumnName(dataKeys[0] ?? 'value')}
              fill={getColor(colors, 0)} radius={[4, 4, 0, 0]}
              maxBarSize={MAX_BAR_WIDTH}
              isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
            />
            <Line
              yAxisId="right" type="monotone" dataKey="__acumulado" name="Acumulado"
              stroke={CHART_COLORS.secondary} strokeWidth={2} dot={{ r: 3 }}
              isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
            />
          </ComposedChart>
        ) : /* composed */ (
          <ComposedChart width={w} height={h} data={data}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis {...xAxisProps} />
            {valueAxes}
            <Tooltip {...tooltipProps} />
            {refLines}
            <Legend {...CHART_LEGEND_STYLE} {...legendProps} />
            {dataKeys.map((key, i) =>
              i === 0
                ? <Bar key={key} yAxisId={seriesAxis(key)} dataKey={key} name={humanizeColumnName(key)} fill={getColor(colors, i)} radius={[6, 6, 0, 0]} maxBarSize={MAX_BAR_WIDTH} isAnimationActive={RECHARTS_ANIMATION_ACTIVE} />
                : <Line
                    key={key}
                    yAxisId={seriesAxis(key)}
                    type="monotone"
                    dataKey={key}
                    name={humanizeColumnName(key)}
                    stroke={getColor(colors, i)}
                    strokeWidth={2}
                    strokeDasharray={isDashed(key) ? '5 4' : undefined}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                    isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                  />
            )}
            {/* Faltava aqui: o `composed` é a combinação que o produto mais
                usa (barra + linha, eixo duplo) e era o único cartesiano sem
                sobreposição. Cada série reaparece na forma que já tem — a
                primeira como barra, as demais como linha tracejada. */}
            {dataKeys.flatMap((key, i) => {
              if (!hasComparison(key)) return [];
              const color = getColor(colors, i);
              const dataKey = `${COMPARISON_PREFIX}${key}`;
              const name = `${humanizeColumnName(key)} (comparativo)`;
              return i === 0
                ? [(
                    <Bar
                      key={dataKey} hide={isHidden(key)} yAxisId={seriesAxis(key)}
                      dataKey={dataKey} name={name} {...comparisonLegend} fill={color} fillOpacity={0.35}
                      radius={[6, 6, 0, 0]} maxBarSize={MAX_BAR_WIDTH}
                      isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                    />
                  )]
                : [(
                    <Line
                      key={dataKey} hide={isHidden(key)} yAxisId={seriesAxis(key)}
                      type="monotone" dataKey={dataKey} name={name} {...comparisonLegend}
                      stroke={color} strokeWidth={1.5} strokeDasharray="5 4"
                      strokeOpacity={0.75} dot={{ r: 2 }} activeDot={{ r: 3, strokeWidth: 2 }}
                      isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                    />
                  )];
            })}
          </ComposedChart>
        )}
      </ChartSizer>
    </div>
  );
}
