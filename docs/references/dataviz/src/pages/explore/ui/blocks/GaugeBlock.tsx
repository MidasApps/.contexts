'use client';

import { useState } from 'react';
import { Gauge } from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine, ReferenceArea, PieChart, Pie,
} from 'recharts';
import { cn } from '@/shared/lib/utils';
import { ComparisonBadge } from './ComparisonBadge';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { KpiExpandedModal } from '@/widgets/kpi-grid/ui/KpiExpandedModal';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/lib/format';
import type { GaugeBlock as GaugeBlockType } from '@/shared/config/agents/types';
import {
  BlockCard, BlockCardHead, BlockValue, BlockValueSkeleton, BLOCK_SUPPORT,
  classifyAgainstLimit, toneInk, type BlockTone,
} from './block-shell';
import {
  limitDistance, limitScale, limitBands, slicesWithMark, valueSlices,
  fractionOnScale, SLICE_SIZE_KEY,
} from './limit-scale';

/**
 * Indicador com limite contratual.
 *
 * ─── Por que não é mais um arco ───
 *
 * A primeira versão desenhava um semicírculo com o número dentro. Não coube:
 * num card de 2/6 (≈242px úteis) e 172px de altura, um arco grande o bastante
 * para abrigar o valor a 30px precisa de ~176px de largura e ~88px de altura, o
 * que empurra o bloco para ~190px e quebra a linha com os KPIs. Encolhido para
 * caber, o arco saía com ~90px e o número o atravessava por cima.
 *
 * O medidor horizontal diz as mesmas três coisas — onde está a régua, onde está
 * o limite, onde caiu o valor — em 12px de altura em vez de 88. E devolve ao
 * número os 30px da régua tipográfica, o que faz o bloco pesar como um KPI, que
 * é o que ele é: um número contra uma referência.
 *
 * De quebra, o desenho passa a ser o MESMO do `targets` (bullet). Um indicador
 * com limite e cinco indicadores com limite deixaram de ser dois desenhos.
 */

function formatGaugeValue(
  v: number,
  fmt: GaugeBlockType['format'],
  decimals: number,
): string {
  if (fmt === 'currency') return formatCurrency(v);
  if (fmt === 'percent') return formatPercent(v, decimals);
  return formatNumber(v, decimals);
}

const STATUS_TONE: Record<BlockTone, string> = {
  neutro: 'sem valor apurado',
  positivo: 'enquadrado',
  atencao: 'próximo do limite',
  ruptura: 'fora do enquadramento',
};

/**
 * A tinta como CLASSE, não como prop `fill`.
 *
 * `fill` vira atributo de apresentação SVG, e atributo não resolve
 * `var(--token)`. Classe utilitária é declaração CSS de verdade e troca com o
 * tema.
 */
const FILL: Record<BlockTone, string> = {
  neutro: 'fill-muted-foreground',
  // Laranja da marca, e nao verde de estado — ver TINTA em `block-shell.tsx`.
  positivo: 'fill-primary',
  atencao: 'fill-warning',
  ruptura: 'fill-destructive',
};

/** Altura do medidor. 14px: grosso o bastante para a faixa se ler, fino o
 *  bastante para não competir com o número. */
const GAUGE_HEIGHT = 14;

/*
 * ─── Geometria do arco, em PIXELS ───
 *
 * Raio percentual foi o bug da primeira versão: o Recharts o calcula sobre
 * `min(largura, altura)` da área do gráfico. Com caixa de 76×240 ele derivou o
 * raio da altura e desenhou um arco de ~90px numa caixa de 240 — e o número a
 * 30px o atravessou por cima. Em pixels o arco tem o tamanho que se pediu,
 * qualquer que seja a caixa.
 *
 * O vão interno mede 2×62 = 124px, e "R$ 1.234,56" a 30px mede ~62px: o número
 * cabe com folga, que era a condição para ele morar dentro do arco.
 */
const ARC = {
  innerValue: 62,
  outerValue: 92,
  innerBand: 96,
  outerBand: 108,
} as const;

/** Altura da caixa do arco: o raio maior mais o traço. */
const ARC_HEIGHT = ARC.outerBand + 10;

export function GaugeBlock({
  block,
  loading = false,
  expandable = false,
}: {
  block: GaugeBlockType;
  loading?: boolean;
  /** Clicar abre o chat sobre este covenant. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const decimals = block.decimals ?? 2;
  const inverted = block.reverseScale ?? false;

  const tone = classifyAgainstLimit({
    valor: block.value,
    limit: block.threshold,
    warning: block.warnThreshold,
    invertedScale: inverted,
  });

  const scale = limitScale({
    limit: block.threshold,
    value: block.value,
    scaleMin: block.scaleMin,
    scaleMax: block.scaleMax,
  });
  const bands = limitBands({
    limit: block.threshold,
    warning: block.warnThreshold,
    invertedScale: inverted,
    scale,
  });

  const display = formatGaugeValue(block.value, block.format, decimals);
  const suffix = block.suffix ?? '';
  const thresholdDisplay = formatGaugeValue(block.threshold, block.format, decimals);
  const distance = limitDistance({
    value: block.value,
    limit: block.threshold,
    invertedScale: inverted,
    formatNumber,
  });

  // Sem valor não há o que perguntar — abrir o chat durante o carregamento
  // mandaria o zero do template como se fosse o número do covenant.
  const isExpandable = expandable && !loading;
  const gaugeData = [{ nome: block.label, valor: block.value }];

  const isArc = block.display === 'arc';
  const limitFraction = fractionOnScale(block.threshold, scale);
  const backgroundSlices = slicesWithMark(bands, limitFraction);
  const valueSliceList = valueSlices(loading ? 0 : fractionOnScale(block.value, scale));

  const accessibleLabel = loading
    ? `${block.label}: carregando`
    : `${block.label}: ${display}${suffix}, ${inverted ? 'máximo' : 'mínimo'} `
      + `${thresholdDisplay}${suffix}, ${STATUS_TONE[tone]}`;

  const supportLine = (
    <p className={cn(BLOCK_SUPPORT, isArc ? 'mt-2 text-center' : 'mt-1.5 flex items-baseline justify-between gap-2')}>
      <span>{`${inverted ? 'Máx.' : 'Mín.'} ${thresholdDisplay}${suffix}`}</span>
      {!loading && distance.text && (
        <span className={cn('font-semibold', toneInk(tone))}>
          {isArc ? ` · ${distance.text}` : distance.text}
        </span>
      )}
    </p>
  );

  /*
   * O desenho do medidor, numa constante: o card o mostra, e o diálogo de "Ver
   * detalhes" TAMBÉM. Ao expandir, o modal montava só rótulo, número e o
   * contexto em prosa — a folga até o covenant, que no card se vê de relance,
   * virava uma frase para ler.
   */
  const gaugeDrawing = (
    <div className="mt-auto pt-3" role="img" aria-label={accessibleLabel}>
          <ChartSizer height={GAUGE_HEIGHT}>
            {(w, h) => (
              <BarChart
                width={w} height={h} data={gaugeData} layout="vertical"
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barCategoryGap="0%"
              >
                <XAxis type="number" domain={[scale.min, scale.max]} hide />
                <YAxis type="category" dataKey="nome" hide />
                {/* As faixas qualitativas — o terreno sob o valor. */}
                {bands.map((f) => (
                  <ReferenceArea
                    key={`${f.tone}-${f.de}`}
                    x1={scale.min + f.de * (scale.max - scale.min)}
                    x2={scale.min + f.ate * (scale.max - scale.min)}
                    className={FILL[f.tone]}
                    fillOpacity={0.22}
                  />
                ))}
                {!loading && (
                  <Bar
                    dataKey="valor"
                    radius={[0, 3, 3, 0]}
                    barSize={6}
                    isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                  >
                    <Cell className={FILL[tone]} />
                  </Bar>
                )}
                {/* A marca do limite contratado — o que torna a folga visível. */}
                <ReferenceLine
                  x={block.threshold}
                  className="stroke-foreground"
                  strokeOpacity={0.85}
                  strokeWidth={2}
                />
              </BarChart>
            )}
              </ChartSizer>
              {supportLine}
            </div>
  );

  return (
    <>
      <BlockCard
        tone={tone}
        loading={loading}
        onExpand={isExpandable ? () => setExpanded(true) : undefined}
        expandLabel={`Analisar ${block.label}`}
      >
        <BlockCardHead label={block.label} support={block.description} />

        {isArc ? (
          <div className="flex flex-1 flex-col justify-center" role="img" aria-label={accessibleLabel}>
            <div className="relative" style={{ height: ARC_HEIGHT }}>
              <ChartSizer height={ARC_HEIGHT}>
                {(w, h) => (
                  <PieChart width={w} height={h}>
                    {/* Anel externo: as faixas qualitativas, com a marca do
                        limite embutida como fatia. */}
                    <Pie
                      data={backgroundSlices}
                      dataKey={SLICE_SIZE_KEY}
                      cx={w / 2}
                      cy={ARC.outerBand + 2}
                      startAngle={180}
                      endAngle={0}
                      innerRadius={ARC.innerBand}
                      outerRadius={ARC.outerBand}
                      stroke="none"
                      // O terreno não anima: só o valor tem novidade a contar.
                      isAnimationActive={false}
                    >
                      {backgroundSlices.map((f) => (
                        <Cell
                          key={f.id}
                          className={f.tone === 'marca' ? 'fill-foreground' : FILL[f.tone]}
                          fillOpacity={f.tone === 'marca' ? 0.9 : 0.32}
                        />
                      ))}
                    </Pie>

                    {/* Anel interno: trilho e valor. */}
                    <Pie
                      data={valueSliceList}
                      dataKey={SLICE_SIZE_KEY}
                      cx={w / 2}
                      cy={ARC.outerBand + 2}
                      startAngle={180}
                      endAngle={0}
                      innerRadius={ARC.innerValue}
                      outerRadius={ARC.outerValue}
                      stroke="none"
                      isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                    >
                      {valueSliceList.map((f) => (
                        <Cell key={f.id} className={f.filled ? FILL[tone] : 'fill-muted'} />
                      ))}
                    </Pie>
                  </PieChart>
                )}
              </ChartSizer>

              {/* O número mora no vão do semicírculo — 124px de largura contra
                  os ~62px que ele mede. `pointer-events-none` para não roubar o
                  hover das fatias. */}
              <div className="pointer-events-none absolute inset-x-0 flex justify-center"
                style={{ bottom: 4 }}>
                {loading
                  ? <BlockValueSkeleton className="h-8 w-24" />
                  : (
                    <div className="flex items-baseline gap-2">
                      <BlockValue tone={tone} suffix={suffix}>{display}</BlockValue>
                      <ComparisonBadge
                        deltaPercent={block.deltaPercent}
                        direction={block.deltaDirection}
                        positiveIsGood={!inverted}
                      />
                    </div>
                  )}
              </div>
            </div>
            {supportLine}
          </div>
        ) : (
          <>
            {loading ? (
              <BlockValueSkeleton />
            ) : (
              <div className="flex items-baseline gap-2">
                <BlockValue tone={tone} suffix={suffix}>{display}</BlockValue>
                <ComparisonBadge
                  deltaPercent={block.deltaPercent}
                  direction={block.deltaDirection}
                  positiveIsGood={!inverted}
                />
              </div>
            )}

            {gaugeDrawing}
          </>
        )}
      </BlockCard>

      {/* Mesmo modal do KPI: número, o desenho do medidor e o chat ao lado. O
          gauge não tem série histórica — quem responde "estou enquadrado?" é o
          arco com a marca do limite, e é ele que vai em `visual`. */}
      <KpiExpandedModal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        config={{
          label: block.label,
          icon: Gauge,
          value: `${display}${suffix}`,
          format: (v: number) => formatGaugeValue(v, block.format, decimals),
          // O número do covenant não significa nada sozinho: quem responde
          // "está enquadrado?" é a comparação com o mínimo contratado.
          context: `${inverted ? 'Máximo' : 'Mínimo'} contratado: ${thresholdDisplay}${suffix}. `
            + `Situação atual: ${STATUS_TONE[tone]}${distance.text ? ` (${distance.text})` : ''}.`,
          // O MESMO desenho do card. Sem ele o diálogo reduzia a posição
          // contra o limite a uma frase — e é o desenho que a mostra.
          visual: gaugeDrawing,
        }}
        sparklineData={[]}
        months={[]}
      />
    </>
  );
}
