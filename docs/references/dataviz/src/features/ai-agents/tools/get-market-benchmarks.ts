import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './tool-context';
import { getBenchmarkData } from '@/shared/lib/bigquery/benchmark-cache';
import type { BenchmarkResult } from '@/shared/lib/bigquery/queries';

const STATIC_FALLBACK = {
  cri: {
    inadimplencia_media: '2-4%',
    over90_media: '1-3%',
    ltv_medio: '50-65%',
    rating_predominante: 'A-C',
    spread_cdi: '1.5-3.0% a.a.',
  },
  geral: {
    inadimplencia_saudavel: '< 3%',
    over90_saudavel: '< 2%',
    ltv_saudavel: '< 60%',
    elegibilidade_saudavel: '> 90%',
    pdd_sobre_saldo_saudavel: '< 2%',
  },
};

const METRICS_ENUM = z.enum([
  'inadimplencia', 'over_90', 'ltv', 'elegibilidade',
  'pdd', 'rating', 'atraso', 'evolucao',
]);

function filterResult(
  result: BenchmarkResult,
  metrics?: z.infer<typeof METRICS_ENUM>[],
) {
  if (!metrics || metrics.length === 0) return result;

  const s = new Set(metrics);
  return {
    resumo: {
      ...(s.has('inadimplencia') ? { inadimplencia_pct: result.resumo.inadimplencia_pct } : {}),
      ...(s.has('over_90') ? { over_90_pct: result.resumo.over_90_pct } : {}),
      ...(s.has('ltv') ? { ltv: result.resumo.ltv } : {}),
      ...(s.has('elegibilidade') ? { elegibilidade_pct: result.resumo.elegibilidade_pct } : {}),
      ...(s.has('pdd') ? {
        pdd_sobre_saldo_pct: result.resumo.pdd_sobre_saldo_pct,
        pdd_bacen_media: result.resumo.pdd_bacen_media,
        pdd_liquid_media: result.resumo.pdd_liquid_media,
        delta_pdd_media: result.resumo.delta_pdd_media,
      } : {}),
    },
    ...(s.has('rating') ? { distribuicao_rating: result.distribuicao_rating } : {}),
    ...(s.has('atraso') ? { distribuicao_atraso: result.distribuicao_atraso } : {}),
    ...(s.has('evolucao') ? { evolucao_mensal: result.evolucao_mensal } : {}),
  };
}

export function createGetMarketBenchmarksTool(ctx: ToolContext) {
  return tool({
    description:
      'Retorna benchmarks reais agregados e anonimizados de todas as carteiras Liquid. ' +
      'Inclui percentis (P25, P50, P75), distribuições de rating e atraso, e evolução mensal. ' +
      'Use para comparar métricas da carteira atual com o mercado Liquid.',
    inputSchema: z.object({
      metricas: z.array(METRICS_ENUM).optional().describe(
        'Métricas específicas a retornar. Se omitido, retorna todas.',
      ),
    }),
    execute: async ({ metricas: metrics }) => {
      try {
        const dateRange = ctx.filters?.dateRange;
        if (!dateRange?.start || !dateRange?.end) {
          return {
            success: false,
            error: 'dateRange não disponível no contexto.',
            fonte: 'fallback_estatico',
            benchmarks: STATIC_FALLBACK.geral,
          };
        }

        const { data, cached } = await getBenchmarkData(dateRange.start, dateRange.end);

        if (!data) {
          // Cai aqui também quando há carteiras de menos para o agregado ser
          // mercado (MIN_BENCHMARK_CLIENTS). A nota diz isso ao modelo em vez de
          // "indisponível": ele precisa saber que o número é referência
          // estática, para não apresentá-lo como comparação com a base real.
          return {
            success: true,
            fonte: 'fallback_estatico',
            nota:
              'Sem carteiras suficientes para um agregado de mercado — os valores abaixo são ' +
              'referência estática do setor, NÃO a média das carteiras Liquid. Deixe isso ' +
              'explícito ao citá-los e não os apresente como comparação com a base atual.',
            benchmarks: STATIC_FALLBACK.cri,
          };
        }

        const filtered = filterResult(data, metrics);

        return {
          success: true,
          periodo: { start: dateRange.start, end: dateRange.end },
          ...filtered,
          fonte: 'Agregado anonimizado de carteiras Liquid',
          cached,
        };
      } catch (err) {
        console.error('[get_market_benchmarks] Error:', err);
        return {
          success: true,
          fonte: 'fallback_estatico',
          nota: 'Erro ao buscar dados reais. Valores de referência estáticos.',
          benchmarks: STATIC_FALLBACK.cri,
        };
      }
    },
  });
}
