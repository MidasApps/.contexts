'use client';

import { AppBar } from '@/widgets/app-bar';
import { Switch } from '@/shared/ui/switch';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { useAppStore } from '@/shared/stores/app-store';
import { useOrchestratorMetrics } from '@/shared/hooks/useOrchestratorMetrics';
import { PhaseTable } from './PhaseTable';
import { SubAgentMetricsCard } from './SubAgentMetricsCard';
import { RetryRateChart } from './RetryRateChart';

export function OrchestratorAnalyticsPage() {
  const { data, loading, error, refetch } = useOrchestratorMetrics();
  const featureFlags = useAppStore((s) => s.featureFlags);
  const setFeatureFlag = useAppStore((s) => s.setFeatureFlag);

  return (
    <div className="flex flex-col h-full min-h-0">
      <AppBar pageTitle="Orchestrator Analytics" />

      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">Supervisor / sub-agents</h1>
              <Badge variant="outline" className="border-orange-400/40 text-orange-300 bg-orange-500/10">
                Experimental
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Telemetria do supervisor analítico (Sprint 3.B). Spans são emitidos
              via <code className="text-xs px-1 rounded bg-muted/50">recordSpan</code> para
              Cloud Logging — esta tela agrega quando um pipeline de leitura
              estiver disponível.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </header>

        {/* Feature flag toggles */}
        <section className="rounded-xl border border-border bg-muted/40 p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Feature flags (Sprint 3.B)</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-foreground">useImprovedSupervisor</div>
                <div className="text-xs text-muted-foreground">
                  Habilita gating por fase + compactação V2 no orchestrator.
                </div>
              </div>
              <Switch
                checked={featureFlags.useImprovedSupervisor}
                onCheckedChange={(v) => setFeatureFlag('useImprovedSupervisor', v === true)}
                aria-label="useImprovedSupervisor"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-foreground">useVertexPromptCache</div>
                <div className="text-xs text-muted-foreground">
                  Habilita Vertex <code className="text-[10px] px-1 rounded bg-muted/50">cachedContent</code>{' '}
                  (scaffold — sem cache real ainda).
                </div>
              </div>
              <Switch
                checked={featureFlags.useVertexPromptCache}
                onCheckedChange={(v) => setFeatureFlag('useVertexPromptCache', v === true)}
                aria-label="useVertexPromptCache"
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Falha ao carregar métricas: {error}
          </div>
        ) : null}

        <SubAgentMetricsCard
          rows={data?.subAgents ?? []}
          cacheHitRate={data?.cacheHitRate ?? 0}
        />

        <PhaseTable rows={data?.phases ?? []} />

        <RetryRateChart points={data?.retryRate ?? []} />

        {data?.experimental ? (
          <p className="text-xs text-muted-foreground/80">
            Snapshot gerado em {new Date(data.generatedAt).toLocaleString('pt-BR')}.
            Endpoint atualmente retorna shape vazio (stub).
          </p>
        ) : null}
      </div>
    </div>
  );
}
