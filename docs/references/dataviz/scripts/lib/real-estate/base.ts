/**
 * Infraestrutura do gerador sintético de imobiliária: PRNG determinístico,
 * datas e tipos compartilhados. Sem rede, sem I/O.
 */

export type Row = Record<string, string | number | boolean | null>;
export type Tables = Record<string, Row[]>;

export interface Rng {
  /** [0, 1) */
  (): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  /** Escolhe por peso (array de [item, peso]). */
  weighted<T>(pairs: ReadonlyArray<readonly [T, number]>): T;
  chance(p: number): boolean;
  /** Normal aproximada (Box-Muller). */
  normal(mean: number, sd: number): number;
}

/** mulberry32 — mesmo PRNG de `synthetic-portfolio.ts`. */
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next as Rng;
  rng.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.weighted = (pairs) => {
    const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
    let remaining = next() * total;
    for (const [item, weight] of pairs) {
      remaining -= weight;
      if (remaining <= 0) return item;
    }
    return pairs[pairs.length - 1][0];
  };
  rng.chance = (p) => next() < p;
  rng.normal = (mean, sd) => {
    const u = 1 - next();
    const v = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return rng;
};

// ── datas (tudo em UTC, ISO YYYY-MM-DD) ──────────────────────────────────
export const iso = (date: Date) => date.toISOString().slice(0, 10);
export const fromIso = (value: string) => new Date(`${value}T00:00:00Z`);
export const endOfMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0));
export const startOfMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0, 1));

/** Últimos dias de mês, do mais antigo ao mais recente, terminando em `last`. */
export const monthlySnapshots = (last: string, months: number): string[] => {
  const [year, month] = last.split('-').map(Number);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(iso(endOfMonth(year, month - 1 - i)));
  return out;
};

export const firstDay = (snapshot: string) => `${snapshot.slice(0, 8)}01`;
export const addDays = (date: string, n: number) => iso(new Date(fromIso(date).getTime() + n * 86_400_000));
export const addMonths = (date: string, n: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + n, 1));
  const lastDay = endOfMonth(target.getUTCFullYear(), target.getUTCMonth()).getUTCDate();
  return iso(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay))));
};
export const daysBetween = (a: string, b: string) => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86_400_000);
export const monthsBetween = (a: string, b: string) => {
  const [yearA, monthA] = a.split('-').map(Number);
  const [yearB, monthB] = b.split('-').map(Number);
  return (yearB - yearA) * 12 + (monthB - monthA);
};
/** Dia aleatório dentro do mês da foto. */
export const dayOfMonth = (rng: Rng, snapshot: string) => {
  const [year, month] = snapshot.split('-').map(Number);
  const lastDay = endOfMonth(year, month - 1).getUTCDate();
  return `${snapshot.slice(0, 8)}${String(rng.int(1, lastDay)).padStart(2, '0')}`;
};
/** Timestamp ISO com hora comercial pesada (08–20h) para heatmap dia × hora. */
export const timestampOf = (rng: Rng, day: string) => {
  const hour = rng.weighted([[8, 2], [9, 5], [10, 8], [11, 8], [12, 4], [13, 4], [14, 7], [15, 8], [16, 8], [17, 7], [18, 6], [19, 4], [20, 3], [21, 2], [22, 1]] as const);
  return `${day}T${String(hour).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}:00Z`;
};
export const monthOf = (date: string) => date.slice(0, 7);
export const roundTo = (value: number, decimals = 2) => Math.round(value * 10 ** decimals) / 10 ** decimals;
export const id = (prefix: string, n: number, width = 6) => `${prefix}-${String(n).padStart(width, '0')}`;
