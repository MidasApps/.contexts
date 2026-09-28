import { useId, useMemo } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ArrowUpRight, ArrowDownRight, Minus, ChevronRight, Maximize2 } from 'lucide-react';
import { AreaChart, Area, Tooltip } from 'recharts';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { formatMonthLabel, formatNumber } from '@/shared/lib/format';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { CHART_TOOLTIP_STYLE } from '@/shared/config/chart-theme';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  variant?: 'compact' | 'rich';
  // Compact variant props (existing)
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
  comparison?: {
    previousValue: string;
    delta: string;
    deltaPercent: string;
    trend: 'up' | 'down' | 'neutral';
    positiveIsGood?: boolean;
  };
  sparklineData?: number[];
  // Rich variant props (from Dashboard)
  icon?: React.ElementType;
  glossaryTerm?: string;
  onExpand?: () => void;
  trendBadge?: {
    direction: 'up' | 'down' | 'neutral';
    percent: string;
    positiveIsGood?: boolean;
  };
  // Period comparison (compare toggle)
  periodComparison?: {
    deltaPercent: number;
    direction: 'up' | 'down' | 'neutral';
    positiveIsGood: boolean;
    previousSparklineData?: number[];
  };
  // Drill-down & alerts
  href?: string;
  alert?: boolean;
  // Sparkline month labels for tooltip
  sparklineMonths?: string[];
  /**
   * Formata os números da sparkline no tooltip. O card recebe `value` já
   * pronto como string, mas a série vem em número cru — sem isto o tooltip
   * exibia "48200000" abaixo de um card que diz "R$ 48,2 mi".
   */
  formatValue?: (v: number) => string;
  // Inline delta badge (comparison mode)
  badge?: ReactNode;
  /** Field is unavailable in client schema — show empty state */
  unavailable?: boolean;
  // Common
  loading?: boolean;
  className?: string;
  animationIndex?: number;
}

export function KpiCard(props: KpiCardProps) {
  const { variant = 'compact' } = props;

  if (variant === 'rich') {
    return <RichKpiCard {...props} />;
  }

  return <CompactKpiCard {...props} />;
}

// ─── Compact variant (original widget KpiCard) ──────────

function CompactKpiCard({
  label,
  value,
  subtitle,
  trend,
  comparison,
  loading,
  className,
  animationIndex,
  sparklineData,
  href,
  alert,
  badge,
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex flex-col justify-center h-full">
          <Skeleton className="h-4 w-24 mb-3 bg-muted" />
          <Skeleton className="h-10 w-32 bg-muted" />
          <Skeleton className="h-8 w-full mt-3 bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const comparisonColor = comparison
    ? getComparisonColor(comparison.trend, comparison.positiveIsGood ?? true)
    : null;

  const TrendIcon = comparison
    ? comparison.trend === 'up'
      ? ArrowUpRight
      : comparison.trend === 'down'
        ? ArrowDownRight
        : Minus
    : null;

  const animationDelay = animationIndex !== undefined
    ? { animationDelay: `${animationIndex * 75}ms` }
    : undefined;

  const card = (
    <Card
      className={cn(
        className,
        animationIndex !== undefined && 'animate-slide-up',
        href && 'cursor-pointer transition-colors hover:bg-muted/40',
        alert && 'border-l-2 border-l-destructive/60',
      )}
      style={animationDelay}
    >
      <CardContent className="p-6 flex flex-col justify-center h-full">
        <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-2">
          {label}
        </p>
        <p className="font-display text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
          {value}
        </p>
        {badge && <div className="mt-1">{badge}</div>}
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend && !comparison && (
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              trend.direction === 'up' && 'text-success',
              trend.direction === 'down' && 'text-destructive',
              trend.direction === 'neutral' && 'text-muted-foreground'
            )}
          >
            {trend.value}
          </p>
        )}
        {comparison && (
          <div className="mt-2 flex items-center gap-1.5">
            {TrendIcon && (
              <TrendIcon
                className={cn('h-3.5 w-3.5', comparisonColor)}
                strokeWidth={2}
              />
            )}
            <span className={cn('text-xs font-semibold', comparisonColor)}>
              {comparison.deltaPercent}
            </span>
            <span className="text-xs text-muted-foreground">
              vs {comparison.previousValue}
            </span>
          </div>
        )}
        {sparklineData && sparklineData.length >= 2 && (
          <MiniBarChart
            data={sparklineData}
            positiveIsGood={comparison?.positiveIsGood}
          />
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} className="block">{card}</Link>;
  }

  return card;
}

// ─── Rich variant (Dashboard-style KpiCard) ─────────────

function RichKpiCard({
  label,
  value,
  icon: Icon,
  glossaryTerm,
  sparklineData,
  sparklineMonths,
  formatValue,
  trendBadge,
  periodComparison,
  onExpand,
  loading,
  animationIndex = 0,
  className,
  href,
  alert,
  unavailable,
}: KpiCardProps) {
  const chartData = useMemo(
    () => sparklineData?.map((v, i) => ({
      value: v,
      i,
      month: sparklineMonths?.[i] ?? undefined,
      previousValue: periodComparison?.previousSparklineData?.[i] ?? undefined,
    })) ?? [],
    [sparklineData, sparklineMonths, periodComparison?.previousSparklineData],
  );

  const trend = trendBadge ?? { direction: 'neutral' as const, percent: '0%', positiveIsGood: true };
  const positiveIsGood = trend.positiveIsGood ?? true;

  const isPositive = positiveIsGood
    ? trend.direction === 'up'
    : trend.direction === 'down';
  const isNegative = positiveIsGood
    ? trend.direction === 'down'
    : trend.direction === 'up';

  /*
   * O id do gradiente NÃO pode sair do rótulo.
   *
   * Ele era `kpi-rich-${label}-${animationIndex}`, e rótulo é texto de
   * negócio: "Permuta (m²)", "PDD (Bacen)". O parêntese fecha o token de
   * `fill="url(#…)"` antes da hora, a referência não resolve e o navegador
   * pinta a área com o fallback — o bloco cinza que aparecia no lugar do
   * gradiente da marca, só nos KPIs cujo nome tinha parêntese.
   *
   * O mesmo id também colidia: dois cards com o mesmo rótulo na mesma posição
   * definiam gradientes homônimos, e o segundo passava a pintar com a tinta do
   * primeiro (`currentColor` resolve no nó onde o gradiente é DEFINIDO).
   *
   * `useId` resolve os dois: é único por instância e estável entre servidor e
   * cliente. O saneamento existe porque o valor que ele devolve traz
   * delimitadores próprios do React (`«r0»`), que não valem num id de SVG.
   */
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `kpi-rich-${instanceId}`;
  /*
   * A sparkline pegava cor de hex literal (`'#F3A169'` / `'#F27C7C'`), que não
   * troca com o tema — e no mesmo arquivo o `MiniBarChart` já usava
   * `var(--color-success)`. Duas técnicas para a mesma decisão, uma delas
   * quebrada.
   *
   * Nem uma nem outra serve num nó SVG: `stroke`/`stopColor` viram ATRIBUTO de
   * apresentação, e atributo não resolve custom property (a substituição de
   * `var()` só acontece em declaração CSS). O que resolve ali é `currentColor`,
   * herdado do `color` do wrapper — a técnica que `chart-theme.ts` documenta e
   * que o resto dos gráficos já usa.
   */
  const sparkInk = alert ? 'text-destructive' : 'text-primary';

  if (loading) {
    // Mesma moldura do card real, e o rótulo continua legível: ele vem do
    // template, não da consulta. Só o valor é esqueleto. A versão anterior
    // eram três barras cinza anônimas — 168px de altura contra os ~120px do
    // card real, então a página ainda pulava quando o dado chegava.
    return (
      // A MESMA estrutura do card real: cabeçalho no topo, valor num `flex-1`
      // centrado, sparkline colada na base. Sem isto o esqueleto desenhava o
      // valor logo abaixo do rótulo e ele SALTAVA para o centro quando o dado
      // chegava — e o card ainda crescia, se houvesse série.
      <div className={cn('h-full', className)}>
        <div data-casca="" className="flex h-full flex-col rounded-2xl bg-popover border border-border p-5" aria-busy="true">
          <div className="flex min-h-7 shrink-0 items-center gap-2.5 mb-3">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />}
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <Skeleton className="h-8 w-28 rounded-md bg-muted/60" />
          </div>
          {/* O bloco declara a sparkline por métrica própria; se ela existe, o
              card real reserva 56px na base — e o esqueleto reserva também. */}
          {sparklineData !== undefined && (
            <Skeleton className="mt-3 h-14 shrink-0 -mx-5 -mb-5 rounded-none rounded-b-2xl bg-muted/30" />
          )}
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className={cn('h-full animate-slide-up', className)} style={{ animationDelay: `${animationIndex * 60}ms` }}>
        <div data-casca="" className="rounded-2xl bg-popover border border-border p-5 h-full flex flex-col items-center justify-center text-center min-h-[140px]">
          {Icon && <Icon className="h-5 w-5 text-muted-foreground/40 mb-2" strokeWidth={1.5} />}
          <p className="text-xs font-medium text-muted-foreground/80">{label}</p>
          <p className="text-[10px] text-muted-foreground/40 mt-1">Dado não disponível para este cliente</p>
        </div>
      </div>
    );
  }

  const richContent = (
    <div
      onClick={onExpand ? (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, select, [role="button"], [data-no-expand]')) return;
        onExpand();
      } : undefined}
      // Sem a supressão de foco que existia aqui: ela apagava o anel de TODO
      // descendente, incluindo o Link de navegação e o botão de expandir.
      className={cn(
        // `h-full`: sem ele o card ignora a altura que a linha lhe deu — ver
        // a nota na raiz do ChartWidget.
        'group relative h-full rounded-2xl transition-all duration-300 animate-slide-up',
        onExpand && 'cursor-pointer',
        className,
      )}
      style={{ animationDelay: `${animationIndex * 60}ms` }}
    >
      {alert && (
        <span className="absolute top-3 right-3 z-10 h-2 w-2 rounded-full bg-destructive animate-pulse" />
      )}
      {/*
        `flex flex-col` na casca e o valor num `flex-1` centrado: o KPI é o
        bloco com MENOS conteúdo do produto — um rótulo e um número —, e é o
        que mais recebe altura de vizinho. Ancorado no topo, ele mostrava o
        número em cima e 150px de branco embaixo. Centrado, a mesma altura
        sobrando lê como respiro. A sparkline, quando existe, continua colada
        na base.
      */}
      {/* Hover em cinza, como no card de bloco (`block-shell`) e no de gráfico:
          a borda ganha contraste, não a cor da marca. O card em alerta é a
          exceção — ali a cor É a informação, e o hover só a reforça. */}
      <div data-casca="" className={cn('flex h-full flex-col rounded-2xl bg-popover p-5 border transition-colors', alert ? 'border-destructive/40 group-hover:border-destructive/70' : 'border-border group-hover:border-muted-foreground/40')}>
        <div className="flex shrink-0 items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            )}
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              {label}
              {glossaryTerm && <InfoTooltip term={glossaryTerm} />}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/*
              O cabeçalho é do selo de TENDÊNCIA (mês contra mês anterior da
              própria série). A variação contra o período comparativo mora
              embaixo do valor, no `PeriodDeltaBadge`, e tem rótulo visível.

              ⚠️ Havia um segundo pill de comparativo AQUI, e os dois acendiam
              juntos: a mesma variação duas vezes no mesmo cartão, com
              separadores decimais diferentes ("+12,3%" em cima, "+12.3%"
              embaixo). Enquanto a guarda de `applyComparisonToBlock`
              reprovava todo KPI de posição o dado nunca chegava e a duplicata
              era invisível; com a ADR-0027 ela apareceria em 46 cartões.

              Mesmo sem duplicar, o lugar seria errado: aqui o comparativo
              ficaria colado no selo de tendência, dois pills de mesma forma
              distinguíveis só por tooltip — que em tela de toque não existe.
            */}
            {trend.direction !== 'neutral' && (
              <TooltipProvider delayDuration={200}>
                <RadixTooltip>
                  <TooltipTrigger asChild>
                    <div className={cn('flex items-center gap-0.5 text-[11px] font-semibold cursor-help', isPositive && 'text-success', isNegative && 'text-destructive')}>
                      {trend.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {trend.percent}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4} className="bg-popover border-border text-foreground text-xs px-3 py-1.5">Variação vs mês anterior</TooltipContent>
                </RadixTooltip>
              </TooltipProvider>
            )}
            {/*
              Só quando há tendência DE VERDADE.

              `trend` cai num default `{ direction: 'neutral', percent: '0%' }`
              quando `trendBadge` não é passado — e passou a desenhar "— 0%"
              num KPI que não tem série histórica nenhuma. Isso não é "não
              variou": é "não sabemos", e a tela afirmava a primeira coisa. Um
              zero inventado no canto de um indicador é do mesmo tipo de erro
              que o "0,00x" vermelho num covenant antes do dado chegar.
            */}
            {trendBadge && trend.direction === 'neutral' && (
              <TooltipProvider delayDuration={200}>
                <RadixTooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground/40 cursor-help">
                      <Minus className="h-3 w-3" /> {trend.percent}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4} className="bg-popover border-border text-foreground text-xs px-3 py-1.5">Sem variação vs mês anterior</TooltipContent>
                </RadixTooltip>
              </TooltipProvider>
            )}

            {/* Expandir só existia como onClick na div do card — sem controle
                focável, era inalcançável por teclado (WCAG 2.1.1). O card não
                pode virar `role="button"` porque contém Link e tooltips, e
                interativo aninhado é inválido; então ganha um botão real, o
                mesmo padrão que o ChartWidget já usa. */}
            {onExpand && (
              <button
                type="button"
                data-no-expand
                onClick={(e) => { e.stopPropagation(); onExpand(); }}
                aria-label={`Ver detalhes de ${label}`}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-all border border-border opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}

            {href && (
              <Link
                href={href}
                onClick={(e) => e.stopPropagation()}
                // `focus-visible:opacity-100`: sem isto o link recebia foco por
                // Tab e continuava invisível (opacity-0 até o hover do mouse).
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-all border border-border opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Ir para página"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center">
        <p className="font-display text-3xl font-bold tracking-tight text-foreground mb-1">
          {value}
        </p>

        {/* Inclusive com direção `neutral`: "não mudou entre os dois períodos"
            é resposta, e escondê-la faz o controle de comparação parecer sem
            efeito exatamente nos blocos que ficaram parados. */}
        {periodComparison && (
          <PeriodDeltaBadge
            deltaPercent={periodComparison.deltaPercent}
            direction={periodComparison.direction}
            positiveIsGood={periodComparison.positiveIsGood}
          />
        )}
        </div>

        {chartData.length >= 2 && (
          <div className={cn('mt-3 h-14 shrink-0 -mx-5 -mb-5 overflow-hidden', sparkInk)}>
            <ChartSizer height={56}>
              {(w, h) => (
                <AreaChart width={w} height={h} data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {/* Mesma casca dos gráficos (`CHART_TOOLTIP_STYLE`): a
                      sparkline tinha um card próprio, com outro raio, outro
                      padding e outro fundo — três aparências de tooltip na
                      mesma tela. E o número saía CRU, sem a unidade do card. */}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      const month = d?.month;
                      const currentVal = payload[0].value as number;
                      const prevVal = d?.previousValue as number | undefined;
                      const numberValue = formatValue ?? ((v: number) => v.toLocaleString('pt-BR'));
                      return (
                        <div style={CHART_TOOLTIP_STYLE.contentStyle}>
                          {month && <div style={CHART_TOOLTIP_STYLE.labelStyle}>{formatMonthLabel(month)}</div>}
                          <div style={{ fontVariantNumeric: 'tabular-nums' }}>{numberValue(currentVal)}</div>
                          {prevVal != null && (
                            <div style={{ color: 'var(--color-muted-foreground)', marginTop: '3px' }}>
                              {`anterior ${numberValue(prevVal)}`}
                            </div>
                          )}
                        </div>
                      );
                    }}
                    cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={label}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    // O `stroke` do activeDot era `var(--color-popover)` — mesma
                    // armadilha: atributo SVG não resolve custom property, então
                    // o ponto ativo nunca teve o contorno que o separa da área.
                    activeDot={{ r: 3, fill: 'currentColor', stroke: 'currentColor', strokeOpacity: 0.25, strokeWidth: 2 }}
                    isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                  />
                  {periodComparison?.previousSparklineData && periodComparison.previousSparklineData.length >= 2 && (
                    <Area
                      type="monotone"
                      dataKey="previousValue"
                      name="Período anterior"
                      stroke="currentColor"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      strokeOpacity={0.4}
                      fill="none"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                    />
                  )}
                </AreaChart>
              )}
            </ChartSizer>
          </div>
        )}
      </div>
    </div>
  );

  return richContent;
}

// ─── Period Delta Badge ─────────────────────────────────

/**
 * A variação contra o período comparativo — o ÚNICO selo do card para essa
 * leitura, e o irmão do `ComparisonBadge` que gauge e progresso desenham.
 *
 * ⚠️ Duas armadilhas, ambas já cometidas aqui:
 *
 * 1. O número saía por `{sinal}{Math.abs(delta).toFixed(1)}` com
 *    `sinal = delta > 0 ? '+' : ''`. O menos das QUEDAS evaporava: -8,5%
 *    aparecia como "8.5%" — o número de uma alta — embaixo de uma seta para
 *    baixo. E `toFixed` escreve ponto decimal, então o mesmo cartão misturava
 *    "12,3%" e "12.3%". `formatNumber` resolve os dois: pt-BR e sinal do
 *    próprio número.
 * 2. A cor segue o JUÍZO do bloco, não o sinal: inadimplência que sobe é
 *    piora. `isGood ? verde : vermelho` pintava de vermelho também o caso
 *    `neutral`, que não é nem bom nem ruim.
 */
function PeriodDeltaBadge({
  deltaPercent,
  direction,
  positiveIsGood,
}: {
  deltaPercent: number;
  direction: 'up' | 'down' | 'neutral';
  positiveIsGood: boolean;
}) {
  const isGood = direction === (positiveIsGood ? 'up' : 'down');
  const isBad = direction === (positiveIsGood ? 'down' : 'up');
  const sign = deltaPercent > 0 ? '+' : '';

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <div
        className={cn(
          'flex items-center gap-0.5 text-[10px] font-semibold',
          isGood && 'text-success',
          isBad && 'text-destructive',
          !isGood && !isBad && 'text-muted-foreground',
        )}
      >
        {direction === 'up' ? <ArrowUpRight className="h-2.5 w-2.5" />
          : direction === 'down' ? <ArrowDownRight className="h-2.5 w-2.5" />
          : <Minus className="h-2.5 w-2.5" />}
        {`${sign}${formatNumber(deltaPercent, 1)}%`}
      </div>
      <span className="text-[9px] text-muted-foreground/60">vs comparativo</span>
    </div>
  );
}

// ─── Shared helpers ─────────────────────────────────────

function MiniBarChart({
  data,
  positiveIsGood = true,
}: {
  data: number[];
  positiveIsGood?: boolean;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const color = getSparklineColor(data, positiveIsGood);

  return (
    <div className="mt-3 flex items-end gap-[3px] h-8">
      {data.map((v, i) => {
        const pct = ((v - min) / range) * 100;
        const height = Math.max(pct, 8);
        const isLast = i === data.length - 1;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-200 hover:opacity-100"
            style={{
              height: `${height}%`,
              backgroundColor: color,
              opacity: isLast ? 0.9 : 0.4,
            }}
            title={v.toLocaleString('pt-BR')}
          />
        );
      })}
    </div>
  );
}

function getComparisonColor(
  trend: 'up' | 'down' | 'neutral',
  positiveIsGood: boolean,
): string {
  if (trend === 'neutral') return 'text-muted-foreground';
  if (trend === 'up') {
    return positiveIsGood ? 'text-success' : 'text-destructive';
  }
  return positiveIsGood ? 'text-destructive' : 'text-success';
}

function getSparklineColor(
  data: number[],
  positiveIsGood: boolean = true,
): string {
  const first = data[0];
  const last = data[data.length - 1];
  if (last > first) return positiveIsGood ? 'var(--color-success)' : 'var(--color-destructive)';
  if (last < first) return positiveIsGood ? 'var(--color-destructive)' : 'var(--color-success)';
  return 'var(--color-muted-foreground)';
}
