'use client';

import { cn } from '@/shared/lib/utils';
import { useAppStore } from '@/shared/stores/app-store';
import type { PreliminaryStatus } from '@/shared/config/agents/types';
import {
  Sparkles,
  Brain,
  FileCode2,
  Database,
  CheckCircle2,
  Search,
  BarChart3,
  FlaskConical,
  Download,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Lightbulb,
  Shield,
  DollarSign,
  MessageCircleQuestion,
} from 'lucide-react';
import { SqlPreview } from './SqlPreview';

interface ToolStepIndicatorProps {
  status: PreliminaryStatus;
  agent?: string;
  message?: string;
  sql?: string;
  rowCount?: number;
  elapsedMs?: number;
  isActive?: boolean;
}

const STATUS_CONFIG: Record<PreliminaryStatus, {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  routing: {
    icon: Sparkles,
    label: 'Roteando',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
  },
  analyzing: {
    icon: Brain,
    label: 'Analisando',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  generating_sql: {
    icon: FileCode2,
    label: 'Gerando SQL',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
  executing_sql: {
    icon: Database,
    label: 'Executando consulta',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
  },
  query_complete: {
    icon: CheckCircle2,
    label: 'Consulta concluída',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
  searching: {
    icon: Search,
    label: 'Buscando dados',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  describing: {
    icon: BarChart3,
    label: 'Analisando dados',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  diagnosing: {
    icon: Search,
    label: 'Diagnosticando causas',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
  },
  predicting: {
    icon: TrendingUp,
    label: 'Projetando tendências',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
  },
  prescribing: {
    icon: Lightbulb,
    label: 'Gerando recomendações',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
  monitoring: {
    icon: Shield,
    label: 'Verificando compliance',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
  },
  analyzing_cashflow: {
    icon: DollarSign,
    label: 'Analisando fluxo de caixa',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/20',
  },
  forecasting: {
    icon: TrendingUp,
    label: 'Projetando',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
  },
  checking_compliance: {
    icon: Shield,
    label: 'Verificando compliance',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
  },
  simulating: {
    icon: FlaskConical,
    label: 'Simulando',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/20',
  },
  exporting: {
    icon: Download,
    label: 'Exportando',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  awaiting_input: {
    icon: MessageCircleQuestion,
    label: 'Aguardando resposta',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
  },
  done: {
    icon: CheckCircle2,
    label: 'Concluído',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
  error: {
    icon: AlertTriangle,
    label: 'Erro',
    color: 'text-destructive',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
};

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  descriptive_agent: 'Agente Descritivo',
  diagnostic_agent: 'Agente Diagnóstico',
  predictive_agent: 'Agente Preditivo',
  simulation_agent: 'Agente de Simulação',
  prescriptive_agent: 'Agente Prescritivo',
  monitoring_agent: 'Agente de Monitoramento',
  cashflow_agent: 'Agente de Fluxo de Caixa',
  external_agent: 'Agente Externo',
};

export function ToolStepIndicator({
  status,
  agent,
  message,
  sql,
  rowCount,
  elapsedMs,
  isActive,
}: ToolStepIndicatorProps) {
  const debugMode = useAppStore((s) => s.debugMode);
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.analyzing;
  const Icon = config.icon;

  const isDone = status === 'done' || status === 'query_complete';
  const isError = status === 'error';

  const elapsedSeconds = elapsedMs != null ? (elapsedMs / 1000).toFixed(1) : null;

  // Build display label
  let displayLabel = message ?? config.label;
  if (status === 'routing' && agent) {
    displayLabel = `Roteando para ${AGENT_DISPLAY_NAMES[agent] ?? agent.replace('_', ' ')}`;
  } else if (status === 'analyzing' && agent) {
    displayLabel = `${AGENT_DISPLAY_NAMES[agent] ?? agent.replace('_', ' ')} analisando`;
  }

  return (
    <div
      // A linha da mensagem precisa saber quando a resposta COMEÇA por uma
      // pílula: ela é bem mais alta que uma linha de texto e desalinha o
      // avatar. Marca em vez de classe porque a regra mora lá, no container.
      data-passo-ferramenta=""
      className={cn(
        'my-1.5 rounded-lg border px-2.5 py-2 text-[11px] transition-colors',
        config.bgColor,
        config.borderColor,
        isActive && !isDone && !isError && 'animate-pulse',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        {isActive && !isDone && !isError ? (
          <Loader2 className={cn('h-3 w-3 shrink-0 animate-spin', config.color)} strokeWidth={2} />
        ) : (
          <Icon className={cn('h-3 w-3 shrink-0', config.color)} strokeWidth={isDone ? 2.5 : 1.5} />
        )}

        <span className={cn('font-medium', config.color)}>
          {displayLabel}
        </span>

        {/* Metadata chips */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {rowCount != null && (
            <span className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-muted-foreground">
              {rowCount} linhas
            </span>
          )}
          {elapsedSeconds != null && (
            <span className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-muted-foreground/80">
              {elapsedSeconds}s
            </span>
          )}
        </div>
      </div>

      {/* SQL preview — only visible in debug mode */}
      {debugMode && sql && <SqlPreview sql={sql} />}
    </div>
  );
}
