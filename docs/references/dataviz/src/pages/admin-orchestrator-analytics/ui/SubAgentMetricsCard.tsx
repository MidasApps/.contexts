'use client';

import type { SubAgentMetricsRow } from '@app/api/admin/orchestrator-metrics/route';

interface Props {
  rows: SubAgentMetricsRow[];
  cacheHitRate: number;
}

export function SubAgentMetricsCard({ rows, cacheHitRate }: Props) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Sub-agentes (KPIs)</h3>
        <span className="text-xs text-muted-foreground">
          Cache hit: <span className="tabular-nums font-medium text-foreground">{(cacheHitRate * 100).toFixed(1)}%</span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Sem invocações registradas no período.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rows.map((row) => (
            <div key={row.agent} className="rounded-lg border border-border bg-black/20 p-3">
              <div className="text-xs text-muted-foreground">{row.agent}</div>
              <div className="text-lg font-semibold text-foreground tabular-nums">{row.invocations}</div>
              <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
                <div>err: {(row.errorRate * 100).toFixed(1)}%</div>
                <div>tok in/out: {row.avgTokensIn.toFixed(0)} / {row.avgTokensOut.toFixed(0)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
