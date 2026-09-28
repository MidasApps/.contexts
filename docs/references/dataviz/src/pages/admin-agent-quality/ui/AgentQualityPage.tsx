'use client';

import { useMemo, useState } from 'react';
import { AppBar } from '@/widgets/app-bar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { useEvalRuns } from '@/shared/hooks/useEvalRuns';
import { useJudgeDrift } from '@/shared/hooks/useJudgeDrift';
import { ScorerHeatmap } from './ScorerHeatmap';
import { JudgeDriftAlert } from './JudgeDriftAlert';
import { JudgeVersionFilter } from './JudgeVersionFilter';
import { filterByJudgeVersion } from './judge-filter';

/**
 * Sprint 3.D, Task 15 — dashboard de qualidade dos agentes.
 *
 * Mostra:
 *  - Banner de drift do judge LLM (se alertCount > 0).
 *  - Heatmap scorer x persona (cores OKLch).
 *  - Filtro por versao do judge model.
 *  - Refetch manual.
 */
export function AgentQualityPage() {
  const [judgeVersion, setJudgeVersion] = useState<string>('');
  const [suite] = useState<'smoke' | 'full' | 'gold'>('smoke');

  // Janela inteira, sem o filtro de versão: ele é aplicado aqui (`filterByJudgeVersion`).
  const evalRuns = useEvalRuns({ suite, days: 30 });
  const drift = useJudgeDrift(30);

  const { options: judgeOptions, visibleRows } = useMemo(
    () => filterByJudgeVersion({
      rows: evalRuns.data?.rows ?? [],
      driftVersions: (drift.data?.rows ?? []).map((r) => r.judgeModelVersion),
      selected: judgeVersion,
    }),
    [evalRuns.data, drift.data, judgeVersion],
  );

  const refresh = () => {
    void evalRuns.refetch();
    void drift.refetch();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <AppBar pageTitle="Agent Quality" />

      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">Eval runs / scorers</h1>
              <Badge
                variant="outline"
                className="border-orange-400/40 text-orange-300 bg-orange-500/10"
              >
                Experimental
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Heatmap scorer x persona consolidado de{' '}
              <code className="text-xs px-1 rounded bg-muted/50">
                evalRuns (Firestore)
              </code>
              . Drift do judge LLM monitorado contra baseline humano (gold-30).
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <JudgeVersionFilter
              value={judgeVersion}
              options={judgeOptions}
              onChange={setJudgeVersion}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={evalRuns.loading || drift.loading}
            >
              {evalRuns.loading || drift.loading ? 'Atualizando...' : 'Atualizar'}
            </Button>
          </div>
        </header>

        <JudgeDriftAlert data={drift.data} loading={drift.loading} />

        {evalRuns.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Falha ao carregar eval-runs: {evalRuns.error}
          </div>
        ) : null}

        <ScorerHeatmap rows={visibleRows} />

        {evalRuns.data?.stub ? (
          <p className="text-xs text-muted-foreground/80">
            Não foi possível ler os eval runs do Firestore. Veja o log do servidor.
          </p>
        ) : null}
      </div>
    </div>
  );
}
