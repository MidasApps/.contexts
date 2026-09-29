'use client';

import { useId } from 'react';
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { formatMonthLabel, formatNumber } from '@/shared/lib/format';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { CHART_AXIS_STYLE, CHART_GRID_STYLE, CHART_INK_CLASS, CHART_TOOLTIP_STYLE } from '@/shared/config/chart-theme';
import { AISidebar } from '@/widgets/ai-sidebar';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';

export interface KpiModalConfig {
  label: string;
  icon: React.ElementType;
  value: string;
  format: (v: number) => string;
  /**
   * Contexto extra do indicador, anexado ao prompt inicial. Existe para o
   * gauge de covenant, cujo número só significa alguma coisa ao lado do mínimo
   * contratado — perguntar "está enquadrado?" sem informar o limite não tem
   * resposta possível.
   */
  context?: string;
  color?: string;
  /**
   * O desenho do próprio bloco — o arco do medidor, a barra da meta.
   *
   * Existe porque este modal monta uma versão PRÓPRIA do indicador (rótulo,
   * número, contexto em prosa) e, sem série histórica, encerrava com um aviso
   * de vazio. Medidor e progresso nunca têm série: o que eles mostram é a
   * POSIÇÃO contra um limite, e é o desenho que diz isso de relance. No card
   * via-se a folga até o covenant; ao ampliar, restava lê-la numa frase.
   */
  visual?: React.ReactNode;
  trendBadge?: { direction: 'up' | 'down' | 'neutral'; percent: string; positiveIsGood?: boolean };
  periodComparison?: { deltaPercent: number; direction: 'up' | 'down' | 'neutral'; positiveIsGood: boolean };
}

interface KpiExpandedModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: KpiModalConfig | null;
  sparklineData: number[];
  comparisonSparklineData?: number[];
  months: string[];
  height?: number;
}

export function KpiExpandedModal({
  isOpen,
  onClose,
  config,
  sparklineData,
  comparisonSparklineData,
  months,
}: KpiExpandedModalProps) {
  /*
   * Antes de qualquer retorno: hook não pode ficar atrás do `if (!config)`.
   *
   * O id NÃO sai do rótulo. Era `kpi-modal-${config.label}`, e rótulo é texto
   * de negócio — "Permuta (m²)" punha um parêntese dentro de `url(#…)`, que
   * fecha o token antes da hora. A referência não resolvia e a área saía com o
   * fallback do navegador: o bloco cinza no lugar do gradiente. Mesmo defeito
   * que o `KpiCard` tinha, e a mesma correção que o `ChartBlock` já usava.
   */
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  if (!config) return null;

  const color = config.color ?? '#F3A169';
  const Icon = config.icon;
  const gradientId = `kpi-modal-${instanceId}`;
  const hasComparison = comparisonSparklineData && comparisonSparklineData.length >= 2;

  const chartData = sparklineData.map((v, i) => ({
    value: v,
    previousValue: hasComparison ? comparisonSparklineData[i] ?? undefined : undefined,
    month: months[i] ? formatMonthLabel(months[i]) : `M${i + 1}`,
  }));

  const fmtMonth = (m: string) => {
    const [y, mo] = m.split('-');
    return mo && y ? `${mo}/${y}` : m;
  };

  // Duas séries de pontos são o mínimo para desenhar uma linha; abaixo disso
  // não há histórico a mostrar, só o valor atual.
  const hasHistory = chartData.length >= 2;

  const historyStr = sparklineData.length > 0
    ? sparklineData.map((v, i) => `${fmtMonth(months[i] ?? '')}: ${config.format(v)}`).join(', ')
    : 'sem dados históricos';

  const contextStr = config.context ? ` ${config.context}` : '';
  const aiPrompt = `Analise o indicador "${config.label}" (valor atual: ${config.value}).${contextStr} Histórico: ${historyStr}. Cruze com os demais indicadores do dashboard e dê uma interpretação concisa: tendência, correlações com outros indicadores, pontos de atenção e o que significa para a carteira.`;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      {/* Mesma diagramação do modal de gráfico: indicador à esquerda, conversa
          à direita a partir de `lg`. Empilhado, um indicador sem série
          histórica ocupava a faixa de cima com um aviso de vazio centralizado
          enquanto o resto era alinhado à esquerda — e era o caso de TODOS os
          KPIs até a ADR-0027, quando nenhum declarava `sparklineMetricId`.
          Hoje 38 declaram, e os 8 sem série seguem caindo aqui. */}
      {/* A largura segue o conteúdo. Com série histórica o gráfico pede espaço;
          sem ela a coluna esquerda tem quatro linhas, e 1440px viravam um
          deserto ao lado da conversa. */}
      <DialogContent
        className={cn(
          'w-[94vw] bg-popover p-0 gap-0 h-[90vh] max-h-[860px]',
          hasHistory ? 'max-w-[1440px] lg:w-[88vw]' : 'max-w-[1040px] lg:w-[68vw]',
        )}
      >
        <div className="flex h-full flex-col overflow-hidden lg:flex-row">
          {/* Indicador */}
          <div className="flex h-[38%] min-h-0 min-w-0 shrink-0 flex-col justify-center border-b border-border p-6 lg:h-full lg:flex-1 lg:shrink lg:border-b-0 lg:border-r">
            <DialogHeader className="shrink-0 pb-3">
              <DialogTitle className="text-foreground flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                {config.label}
                {config.trendBadge && config.trendBadge.direction !== 'neutral' && (() => {
                  const pos = config.trendBadge.positiveIsGood ?? true;
                  const isGood = pos ? config.trendBadge.direction === 'up' : config.trendBadge.direction === 'down';
                  return (
                    <TooltipProvider delayDuration={200}>
                      <RadixTooltip>
                        <TooltipTrigger asChild>
                          {/* Token, não hex: o card desenha este MESMO selo com
                              `text-success`/`text-destructive`, e hex não troca
                              no tema claro. */}
                          <div className={cn(
                            'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold cursor-help',
                            isGood ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                          )}>
                            {config.trendBadge.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {config.trendBadge.percent}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={4} className="bg-popover border-border text-foreground text-xs px-3 py-1.5">Variação vs mês anterior</TooltipContent>
                      </RadixTooltip>
                    </TooltipProvider>
                  );
                })()}
                {config.trendBadge?.direction === 'neutral' && (
                  <TooltipProvider delayDuration={200}>
                    <RadixTooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-0.5 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground/40 cursor-help">
                          <Minus className="h-3 w-3" /> 0%
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4} className="bg-popover border-border text-foreground text-xs px-3 py-1.5">Sem variação vs mês anterior</TooltipContent>
                    </RadixTooltip>
                  </TooltipProvider>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex shrink-0 items-center gap-3">
              <p className="font-display text-4xl font-bold tracking-tight text-foreground xl:text-5xl">
                {config.value}
              </p>
              {/* Mesmo selo do card, e pelos mesmos motivos — ver o docblock de
                  `PeriodDeltaBadge`: `Math.abs` + sinal só-para-positivo
                  apagava o menos das quedas, e `toFixed` escrevia ponto
                  decimal onde o card escrevia vírgula. Direção `neutral`
                  também aparece: "não mudou" é resposta. */}
              {config.periodComparison && (() => {
                const { deltaPercent, direction, positiveIsGood } = config.periodComparison;
                const isGood = direction === (positiveIsGood ? 'up' : 'down');
                const isBad = direction === (positiveIsGood ? 'down' : 'up');
                const sign = deltaPercent > 0 ? '+' : '';
                return (
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      isGood && 'bg-success/10 text-success',
                      isBad && 'bg-destructive/10 text-destructive',
                      !isGood && !isBad && 'bg-muted/40 text-muted-foreground',
                    )}>
                      {direction === 'up' ? <ArrowUpRight className="h-2.5 w-2.5" />
                        : direction === 'down' ? <ArrowDownRight className="h-2.5 w-2.5" />
                        : <Minus className="h-2.5 w-2.5" />}
                      {`${sign}${formatNumber(deltaPercent, 1)}%`}
                    </div>
                    <span className="text-[9px] text-muted-foreground/60">vs comparativo</span>
                  </div>
                );
              })()}
            </div>
            {/* O contexto do indicador só existia dentro do prompt. Num gauge
                de covenant é ele que dá sentido ao número: "8,31x" sozinho não
                responde se está enquadrado — quem responde é o mínimo
                contratado ao lado. */}
            {config.context && (
              <p className="mt-3 shrink-0 text-sm text-muted-foreground">{config.context}</p>
            )}
            {/* O desenho do bloco vem ANTES da série: ele responde "onde
                estou agora contra o limite", que é a pergunta do medidor e da
                barra de meta. A série, quando existe, responde outra — "como
                cheguei aqui" — e as duas cabem. */}
            {config.visual && (
              <div className="mt-4 shrink-0">{config.visual}</div>
            )}
            {hasHistory ? (
              /* `CHART_INK_CLASS` define o `color` que o `currentColor` dos nós
                 SVG (tick e grade) herda — mesma técnica do `ChartBlock`. Este
                 gráfico só desenha com série, e até a ADR-0027 nenhum KPI tinha
                 uma: estreou em produção com a tipografia branca cravada que o
                 resto dos gráficos já tinha abandonado. */
              <div className={cn('mt-4 min-h-0 flex-1', CHART_INK_CLASS)}>
                <ChartSizer height="100%">
                  {(w, h) => (
                    <AreaChart width={w} height={h} data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...CHART_GRID_STYLE} />
                      {/* O `fill` no nível do eixo NUNCA chegou à tela: o
                          Recharts monta o `<text>` do tick com o stroke do eixo
                          e só depois aplica o objeto `tick`. O que se via era o
                          `#666` default da lib. Ver `CHART_AXIS_STYLE`. */}
                      <XAxis dataKey="month" {...CHART_AXIS_STYLE} />
                      <YAxis {...CHART_AXIS_STYLE} tickFormatter={(v) => config.format(v)} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          const prevVal = d?.previousValue as number | undefined;
                          return (
                            /* Mesma casca dos gráficos, e o mês pelo mesmo
                               formatador do card: aqui ele saía cru, então o
                               tooltip do card dizia "jun/26" e o do modal do
                               MESMO indicador dizia "2026-06". */
                            <div style={CHART_TOOLTIP_STYLE.contentStyle}>
                              {d?.month && (
                                <div style={CHART_TOOLTIP_STYLE.labelStyle}>{formatMonthLabel(String(d.month))}</div>
                              )}
                              <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {config.format(payload[0].value as number)}
                              </div>
                              {prevVal != null && (
                                <div style={{ color: 'var(--color-muted-foreground)', marginTop: '3px' }}>
                                  {`anterior ${config.format(prevVal)}`}
                                </div>
                              )}
                            </div>
                          );
                        }}
                        cursor={{ stroke: 'currentColor', strokeOpacity: 0.25, strokeWidth: 1 }}
                      />
                      <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--color-popover)', strokeWidth: 2 }} isAnimationActive={RECHARTS_ANIMATION_ACTIVE} />
                      {hasComparison && (
                        <Area type="monotone" dataKey="previousValue" name="Comparativo" stroke={color} strokeWidth={1.5} strokeDasharray="5 5" strokeOpacity={0.4} fill="none" dot={false} activeDot={false} isAnimationActive={RECHARTS_ANIMATION_ACTIVE} />
                      )}
                    </AreaChart>
                  )}
                </ChartSizer>
              </div>
            ) : config.visual ? null : (
              // Alinhado à esquerda como o resto da coluna, e sem reservar
              // faixa: antes era um aviso centralizado no meio de conteúdo
              // alinhado à esquerda, o que fazia a tela parecer quebrada.
              //
              // Com o desenho do bloco na tela o aviso perde a função: ele
              // existia para a coluna não ficar vazia, e ela não está mais.
              <p className="mt-3 shrink-0 text-xs text-muted-foreground/50">
                Sem série histórica para este indicador.
              </p>
            )}
          </div>

          {/* Conversa. `pt-6` no topo da coluna: o botão de fechar do diálogo é
              absoluto no canto superior direito, e a primeira mensagem passava
              por baixo dele. */}
          <div className="flex min-h-0 flex-1 flex-col pt-6 lg:h-full lg:w-[420px] lg:flex-none xl:w-[460px]">
            {isOpen && (
              <AISidebar
                open={isOpen}
                onClose={() => {}}
                embedded
                initialPrompt={aiPrompt}
                focusedIndicator={{
                  name: config.label,
                  value: config.value,
                  history: historyStr,
                }}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
