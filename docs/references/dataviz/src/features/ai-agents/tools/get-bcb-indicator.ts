import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';

const INDICATOR_CODES: Record<string, number> = {
  selic_meta: 432,
  selic_over: 1178,
  ipca: 433,
  igpm: 189,
  cdi: 4389,
  cambio_usd: 1,
};

type IndicatorKey = 'selic_meta' | 'selic_over' | 'ipca' | 'igpm' | 'cdi' | 'cambio_usd';

const INDICATOR_ENUM = z.enum([
  'selic_meta',
  'selic_over',
  'ipca',
  'igpm',
  'cdi',
  'cambio_usd',
]);

export const getBcbIndicatorTool = tool({
  description:
    'Fetch recent values of Brazilian economic indicators from the Central Bank of Brazil (BCB) open data API. Available indicators: selic_meta, selic_over, ipca, igpm, cdi, cambio_usd.',
  inputSchema: z.object({
    indicator: INDICATOR_ENUM.describe(
      'The economic indicator to fetch. One of: selic_meta, selic_over, ipca, igpm, cdi, cambio_usd.',
    ),
    lastN: z
      .number()
      .int()
      .min(1)
      .max(120)
      .default(12)
      .describe('Number of most recent data points to return (default 12).'),
  }),
  execute: async ({ indicator, lastN }: { indicator: IndicatorKey; lastN: number }) => {
    try {
      const code = INDICATOR_CODES[indicator];
      if (!code) {
        return {
          success: false,
          error: `Unknown indicator: ${indicator}`,
          indicator,
          data: [] as { data: string; valor: string }[],
        };
      }

      const n = Math.min(Math.max(1, lastN), 120);
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/${n}?formato=json`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return {
          success: false,
          error: `BCB API returned HTTP ${response.status}: ${response.statusText}`,
          indicator,
          data: [] as { data: string; valor: string }[],
        };
      }

      const raw = (await response.json()) as Array<{ data: string; valor: string }>;

      return {
        success: true,
        indicator,
        data: raw.map((item) => ({ data: item.data, valor: item.valor })),
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: false,
          error: 'BCB API request timed out after 10 seconds.',
          indicator,
          data: [] as { data: string; valor: string }[],
        };
      }
      return {
        success: false,
        error: formatToolError(err),
        indicator,
        data: [] as { data: string; valor: string }[],
      };
    }
  },
});
