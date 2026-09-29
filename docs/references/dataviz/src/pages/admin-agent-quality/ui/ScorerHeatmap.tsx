'use client';

import type { EvalRunAggregateRow } from '@app/api/admin/eval-runs/route';

export interface ScorerHeatmapProps {
  rows: EvalRunAggregateRow[];
}

/**
 * Sprint 3.D, Task 15 — heatmap scorer x persona.
 *
 * Agregamos `p50` por celula (usando max sample weight quando ha multiplos
 * clients para o mesmo par). Cores OKLch verde -> vermelho conforme score
 * (1.0 = verde, 0.0 = vermelho).
 */
function scoreToColor(score: number): string {
  // OKLch hue: 142 (verde) -> 25 (vermelho). Lightness fixa 60%.
  const h = 25 + (142 - 25) * Math.min(Math.max(score, 0), 1);
  return `oklch(0.62 0.18 ${h.toFixed(1)})`;
}

interface Cell {
  p50: number;
  sampleSize: number;
  clientIds: Set<string>;
}

export function ScorerHeatmap({ rows }: ScorerHeatmapProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="scorer-heatmap-empty"
        className="rounded-xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground"
      >
        Sem dados ainda — execute `pnpm tsx src/features/evals/runner/run-evals.ts --suite=smoke --persist`
        para popular a coleção `evalRuns` do Firestore.
      </div>
    );
  }

  const scorers = Array.from(new Set(rows.map((r) => r.scorerName))).sort();
  const personas = Array.from(new Set(rows.map((r) => r.personaId))).sort();
  const matrix = new Map<string, Cell>();
  for (const r of rows) {
    const key = `${r.scorerName}|${r.personaId}`;
    const existing = matrix.get(key);
    if (existing) {
      // Weighted avg de p50 por sampleSize.
      const total = existing.sampleSize + r.sampleSize;
      existing.p50 = (existing.p50 * existing.sampleSize + r.p50 * r.sampleSize) / total;
      existing.sampleSize = total;
      existing.clientIds.add(r.clientId);
    } else {
      matrix.set(key, {
        p50: r.p50,
        sampleSize: r.sampleSize,
        clientIds: new Set([r.clientId]),
      });
    }
  }

  return (
    <div
      data-testid="scorer-heatmap"
      className="rounded-xl border border-border bg-muted/40 p-4 overflow-x-auto"
    >
      <table className="text-xs">
        <thead>
          <tr>
            <th className="text-left text-muted-foreground px-2 py-1">scorer \\ persona</th>
            {personas.map((p) => (
              <th key={p} className="text-left text-muted-foreground px-2 py-1">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scorers.map((s) => (
            <tr key={s}>
              <td className="text-foreground px-2 py-1 font-medium">{s}</td>
              {personas.map((p) => {
                const cell = matrix.get(`${s}|${p}`);
                if (!cell) {
                  return (
                    <td key={p} className="px-2 py-1 text-muted-foreground/60">
                      —
                    </td>
                  );
                }
                return (
                  <td key={p} className="px-1 py-1">
                    <div
                      title={`p50=${cell.p50.toFixed(2)} (n=${cell.sampleSize}, clients=${[...cell.clientIds].join(',')})`}
                      style={{ background: scoreToColor(cell.p50) }}
                      className="rounded px-2 py-1 text-foreground text-center min-w-[3.5rem]"
                    >
                      {cell.p50.toFixed(2)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
