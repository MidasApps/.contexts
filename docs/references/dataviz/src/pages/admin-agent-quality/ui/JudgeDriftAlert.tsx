'use client';

import type { JudgeDriftResponse } from '@app/api/admin/judge-drift/route';

export interface JudgeDriftAlertProps {
  data: JudgeDriftResponse | null;
  loading: boolean;
}

/**
 * Sprint 3.D, Task 15 — banner que destaca alertas de drift do judge LLM
 * nos ultimos 30 dias. Renderiza nada quando nao ha alerta.
 */
export function JudgeDriftAlert({ data, loading }: JudgeDriftAlertProps) {
  if (loading) {
    return (
      <div
        data-testid="drift-loading"
        className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
      >
        Carregando drift detector...
      </div>
    );
  }
  if (!data || data.alertCount === 0) return null;
  return (
    <div
      role="alert"
      data-testid="drift-banner"
      className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
    >
      <strong className="font-semibold">Drift detectado:</strong>{' '}
      {data.alertCount} alerta(s) ativos nos ultimos {data.days} dias. Verificar
      rolagem do judge LLM contra baseline humano (gold-30).
    </div>
  );
}
