'use client';

import type { CanvasBlock } from '@/shared/config/agents/types';
import { CanvasBlockRenderer } from '@/pages/explore/ui/CanvasBlockRenderer';
import { withoutMaterializedData } from '@/shared/lib/report/block-data';
import { cn } from '@/shared/lib/utils';

/**
 * Os três estados que não são "deu certo".
 *
 * São os que o usuário mais vê quando algo sai do lugar, e os que menos foram
 * olhados. Cada bloco escolheu o seu por conta própria durante anos: o KPI
 * vazio era um travessão, o donut uma caixa de 180px, o gráfico uma de 340px,
 * e o gauge não tinha nenhum. Ver os três lado a lado, para todos os tipos, é
 * o que revela se agora falam a mesma língua.
 *
 * O VAZIO não é simulado: passa pelo `withoutMaterializedData`, a mesma função
 * que limpa o bloco antes de gravar no Firestore. O que aparece aqui é
 * exatamente o que o bloco desenha quando a métrica não devolve linha.
 */

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3',
  4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
};

/** Um representante por tipo, na largura mínima em que ele é honesto. */
const REPRESENTATIVES: Array<{ label: string; span: number; block: CanvasBlock }> = [
  { label: 'kpi', span: 2, block: { id: 'st-kpi', type: 'kpi', metricId: 'm', label: 'Saldo devedor', value: 'R$ 48,2 mi', format: 'currency' } },
  { label: 'gauge', span: 2, block: { id: 'st-gauge', type: 'gauge', metricId: 'm', label: 'Índice Recebível', value: 1.38, threshold: 1.2, suffix: 'x', decimals: 2 } },
  { label: 'progress', span: 2, block: { id: 'st-progress', type: 'progress', metricId: 'm', label: 'Repasses', value: 39, target: 50, format: 'currency' } },
  { label: 'comparison', span: 3, block: { id: 'st-comparison', type: 'comparison', metricId: 'm', label: 'Inadimplência', current: 4.81, previous: 5.24, format: 'percent', decimals: 2 } },
  { label: 'targets', span: 3, block: { id: 'st-targets', type: 'targets', metricId: 'm', title: 'Covenants', items: [{ label: 'Cobertura', value: 1.4, target: 1.2 }] } },
  { label: 'sparkrows', span: 3, block: { id: 'st-sparkrows', type: 'sparkrows', metricId: 'm', title: 'Tendências', series: [{ name: 'saldo', points: [1, 2, 3] }] } },
  { label: 'donut', span: 3, block: { id: 'st-donut', type: 'donut', metricId: 'm', title: 'Composição', slices: [{ name: 'Pré', value: 1 }] } },
  { label: 'chart', span: 3, block: { id: 'st-chart', type: 'chart', metricId: 'm', chartType: 'line', title: 'Série', xAxisKey: 'mes', dataKeys: ['v'], data: [{ mes: '2026-01', v: 1 }] } },
  { label: 'scatter', span: 3, block: { id: 'st-scatter', type: 'scatter', metricId: 'm', title: 'Dispersão', points: [{ x: 1, y: 2 }] } },
  { label: 'heatmap', span: 3, block: { id: 'st-heatmap', type: 'heatmap', metricId: 'm', title: 'Matriz', cells: [{ row: 'a', col: 'b', value: 1 }] } },
  { label: 'funnel', span: 3, block: { id: 'st-funnel', type: 'funnel', metricId: 'm', title: 'Esteira', etapas: [{ etapa: 'Elegíveis', value: 10 }] } },
  { label: 'boxplot', span: 4, block: { id: 'st-boxplot', type: 'boxplot', metricId: 'm', title: 'LTV por safra', grupos: [{ grupo: '2024', min: 0.3, q1: 0.5, mediana: 0.6, q3: 0.7, max: 0.9 }] } },
  { label: 'treemap', span: 4, block: { id: 'st-treemap', type: 'treemap', metricId: 'm', title: 'Concentração', fatias: [{ name: 'A', value: 1 }] } },
  { label: 'sankey', span: 6, block: { id: 'st-sankey', type: 'sankey', metricId: 'm', title: 'Migração', ordem: ['Sem atraso', '1-30'], fluxos: [{ origem: 'Sem atraso', destino: '1-30', value: 1 }] } },
  { label: 'table', span: 6, block: { id: 'st-table', type: 'table', metricId: 'm', title: 'Detalhe', columns: [{ header: 'Faixa', accessorKey: 'faixa' }, { header: 'Valor', accessorKey: 'valor', format: 'currency' }], rows: [{ faixa: 'a', valor: 1 }] } },
];

const STATES = [
  { key: 'carregando', title: 'Carregando', nota: 'esqueleto na geometria real — o card não pode mudar de altura quando o dado chega' },
  { key: 'vazio', title: 'Vazio', nota: 'a consulta rodou e não devolveu linha. Não é erro, e não pode parecer um' },
  { key: 'erro', title: 'Erro', nota: 'a métrica falhou. Precisa dizer o que houve, não só que houve' },
] as const;

export function BlockStates({ reportWidth }: { reportWidth: boolean }) {
  return (
    <div className={cn('space-y-8', reportWidth && 'max-w-[880px]')}>
      <div className="grid grid-cols-3 gap-4">
        {STATES.map((e) => (
          <div key={e.key}>
            <p className="text-xs font-semibold text-foreground">{e.title}</p>
            <p className="mt-0.5 text-[11px] italic text-muted-foreground/70">{e.nota}</p>
          </div>
        ))}
      </div>

      {REPRESENTATIVES.map(({ label, span, block }) => {
        // O vazio real: o bloco sem o que o pipeline preenche.
        const emptyBlock = withoutMaterializedData(block);
        return (
          <div key={label}>
            <code className="text-[11px] text-muted-foreground">{label} · {span}/6</code>
            <div className="mt-2 grid grid-cols-3 gap-4">
              <div className="grid grid-cols-6 gap-4">
                <div className={COL_SPAN_CLASS[6]}>
                  <CanvasBlockRenderer block={block} loading />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-4">
                <div className={COL_SPAN_CLASS[6]}>
                  <CanvasBlockRenderer block={emptyBlock} />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-4">
                <div className={COL_SPAN_CLASS[6]}>
                  {/* O mesmo caminho do relatório: o erro chega por prop e o
                      renderizador desenha o fantasma com a mensagem por cima. */}
                  <CanvasBlockRenderer
                    block={block}
                    error={`Métrica "covenants.${label}" inválida`}
                    onRetry={() => {}}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
