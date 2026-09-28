const SERIES = {
  selic: 432,
  ipca12m: 433,
  incc12m: 188,
  igpm12m: 189,
  tr12m: 226,
} as const;

export type MacroSeriesKey = keyof typeof SERIES;

const TTL_MS = 60 * 60 * 1000;

export interface SgsPoint {
  data: string; // ISO
  valor: number;
}

export interface MacroSnapshot {
  asOfDate: string;
  source: 'BCB_SGS' | 'fallback';
  series: Record<MacroSeriesKey, { last: number; series: SgsPoint[] }>;
}

let cached: { at: number; data: MacroSnapshot } | null = null;

export function __resetMacroCache(): void {
  cached = null;
}

function brDateToIso(br: string): string {
  // 01/04/2026 → 2026-04-01
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return br;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export async function fetchSgsSeries(id: number, latest = 12): Promise<SgsPoint[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados/ultimos/${latest}?formato=json`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`SGS ${id} HTTP ${r.status}`);
  const raw = (await r.json()) as Array<{ data: string; valor: string }>;
  return raw.map((x) => ({ data: brDateToIso(x.data), valor: Number(x.valor) }));
}

async function loadFallback(): Promise<MacroSnapshot> {
  const mod = await import('@/shared/config/business-context/macro-fallback.json');
  return (mod.default ?? mod) as MacroSnapshot;
}

export async function getMacroSnapshot(): Promise<MacroSnapshot> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  const live = process.env.MACRO_LIVE !== 'false';
  if (live) {
    try {
      const entries = await Promise.all(
        (Object.entries(SERIES) as Array<[MacroSeriesKey, number]>).map(async ([k, id]) => {
          const series = await fetchSgsSeries(id);
          const last = series.at(-1)?.valor ?? 0;
          return [k, { last, series }] as const;
        }),
      );
      const data: MacroSnapshot = {
        asOfDate: new Date().toISOString().slice(0, 10),
        source: 'BCB_SGS',
        series: Object.fromEntries(entries) as MacroSnapshot['series'],
      };
      cached = { at: Date.now(), data };
      return data;
    } catch {
      // fall through
    }
  }
  const fallback = await loadFallback();
  cached = { at: Date.now(), data: fallback };
  return fallback;
}
