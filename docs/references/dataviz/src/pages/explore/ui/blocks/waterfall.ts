export type WaterfallRow = { bucket: string; base: number; delta: number; value: number };

/** Converte {bucket,value} em barras flutuantes: base invisível + delta visível. */
export function toWaterfallData(rows: { bucket: string; value: number }[]): WaterfallRow[] {
  let running = 0;
  return rows.map((r) => {
    const start = running;
    running += r.value;
    const base = Math.min(start, running);
    return { bucket: r.bucket, base, delta: Math.abs(r.value), value: r.value };
  });
}
