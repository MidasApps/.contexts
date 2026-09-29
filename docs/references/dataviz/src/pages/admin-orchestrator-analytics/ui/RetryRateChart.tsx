'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { RetryRatePoint } from '@app/api/admin/orchestrator-metrics/route';

interface Props {
  points: RetryRatePoint[];
}

export function RetryRateChart({ points }: Props) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Retry rate (gating fallback)</h3>
        <p className="text-xs text-muted-foreground">% de steps que ativaram fallback `auto` por janela</p>
      </div>
      {points.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
          Sem séries temporais ainda.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} domain={[0, 1]} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(0,0,0,0.85)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="retryRate"
                stroke="#F3A169"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
