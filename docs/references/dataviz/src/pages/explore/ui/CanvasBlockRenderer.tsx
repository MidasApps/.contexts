'use client';

import type { CanvasBlock } from '@/shared/config/agents/types';
import { TextBlock } from './blocks/TextBlock';
import { KpiBlock } from './blocks/KpiBlock';
import { SingleKpiBlock } from './blocks/SingleKpiBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { TableBlock } from './blocks/TableBlock';
import { DonutBlock } from './blocks/DonutBlock';
import { GaugeBlock } from './blocks/GaugeBlock';
import { TargetsBlock } from './blocks/TargetsBlock';
import { ProgressBlock } from './blocks/ProgressBlock';
import { ComparisonBlock } from './blocks/ComparisonBlock';
import { SparkRowsBlock } from './blocks/SparkRowsBlock';
import { ScatterBlock } from './blocks/ScatterBlock';
import { HeatmapBlock } from './blocks/HeatmapBlock';
import { FunnelBlock } from './blocks/FunnelBlock';
import { SankeyBlock } from './blocks/SankeyBlock';
import { BoxplotBlock } from './blocks/BoxplotBlock';
import { TreemapBlock } from './blocks/TreemapBlock';
import {
  BlockLoadingChart,
  BlockLoadingDonut,
  BlockLoadingMatrix,
  BlockLoadingTable,
  BlockLoadingText,
  BlockLoadingFunnel,
  BlockLoadingTreemap,
  BlockLoadingSankey,
} from './blocks/BlockLoading';
import { ChartWidget } from '@/widgets/chart-widget/ui/ChartWidget';
import { HEIGHT, blockFamilyOf } from './blocks/block-shell';
import { blockSpec } from '@/features/report-authoring/schema/block-specs';
import { GhostBlock } from './blocks/GhostBlock';
import { PeriodBadge, NoPeriodBadge } from './blocks/ComparisonBadge';
import { comparisonBand } from './blocks/comparison-band';
import { ghostData, dataStateOf } from './blocks/ghost-data';

interface CanvasBlockRendererProps {
  block: CanvasBlock;
  onRetry?: (blockId: string) => void;
  /**
   * O dado da métrica deste bloco ainda não chegou.
   *
   * Sem isto o bloco era desenhado com o template cru — e KPI sem dado vale
   * zero. Num covenant de mínimo 1,20x, o "0,00x" era pintado de VERMELHO:
   * a tela afirmava que o covenant estava rompido antes de saber o valor.
   */
  loading?: boolean;
  /**
   * Clicar no bloco abre o modal com o gráfico ampliado e o chat sobre aquele
   * indicador.
   *
   * Default `false` por causa do canvas da IA: lá o bloco está sendo editado e
   * arrastado, e um modal no clique atrapalharia. Era por isso que o
   * `expandable={false}` estava fixo aqui desde março — quando este renderer
   * só servia ao canvas. O relatório herdou a decisão sem ter o problema, e
   * perdeu o modal junto. Agora quem renderiza decide.
   */
  expandable?: boolean;
  /**
   * A métrica deste bloco falhou. Desenha o fantasma com a mensagem por cima,
   * em vermelho.
   *
   * Chega por prop, e não é detectado aqui, porque quem sabe do erro é quem
   * fez a busca — `errorsByMetric` do `useReportData`.
   */
  error?: string | undefined;
}

/**
 * Como este bloco se chama na tela.
 *
 * Cada tipo guarda o nome num campo diferente — `title` nos que têm cabeçalho
 * próprio, `label` nos de um número só. Sem ele, uma página com três blocos
 * falhando mostra três cartões vermelhos idênticos e o leitor não sabe qual
 * indicador perdeu. O rótulo do contrato é o último recurso: melhor "Gráfico"
 * que nada.
 */
function blockName(block: CanvasBlock): string {
  const withName = block as { title?: string; label?: string };
  return withName.title || withName.label || blockSpec(block.type).label;
}

/**
 * Aplica o degrau da escala vertical ao bloco.
 *
 * A linha é `grid grid-cols-6 gap-4`, e grid estica todos os itens até a altura
 * do mais alto. Sem um piso comum por família, dois blocos que respondem à
 * mesma pergunta — um KPI e um gauge, ambos "um número" em 2/6 — desenham
 * alturas diferentes, e o mais baixo ganha um vazio embaixo do conteúdo.
 *
 * O piso vive AQUI e não dentro de cada bloco porque altura só significa algo
 * em relação aos vizinhos, e é o renderizador quem os coloca lado a lado.
 */
function WithFamilyFloor({ block, children }: { block: CanvasBlock; children: React.ReactNode }) {
  const family = blockFamilyOf(block as { type: string; display?: string });
  if (!family) return <>{children}</>;
  return <div className="h-full" style={{ minHeight: HEIGHT[family] }}>{children}</div>;
}

export function CanvasBlockRenderer(props: CanvasBlockRendererProps) {
  const { block, loading = false, error, onRetry } = props;

  /*
   * Erro e vazio passam a ser decididos AQUI, e não dentro de cada bloco.
   *
   * Cada tipo tinha o seu: travessão no KPI, caixa de 180px no donut, de 340px
   * no gráfico, nenhum no gauge. Centralizar é o que permite os dois estados
   * terem a mesma forma — o próprio bloco desenhado com dado de mentira,
   * esmaecido, com a mensagem por cima.
   *
   * `loading` continua com quem sabe desenhar esqueleto na própria geometria:
   * carregar não é falhar, e o esqueleto anuncia movimento.
   */
  // O contrato diz se o bloco consome métrica — não uma lista repetida aqui.
  const consumesMetric = blockSpec(block.type).accepts.length > 0;
  const state = dataStateOf(block, consumesMetric);

  if (!loading && (error || state !== 'ok')) {
    const ghost = (
      <WithFamilyFloor block={block}>
        <RenderBlock block={ghostData(block)} loading={false} expandable={false} />
      </WithFamilyFloor>
    );

    const title = blockName(block);

    if (error) {
      return (
        <GhostBlock
          estado="erro"
          title={title}
          message="Não foi possível carregar"
          detail={error}
          onRetry={onRetry ? () => onRetry(block.id) : undefined}
        >
          {ghost}
        </GhostBlock>
      );
    }

    return state === 'sem-metrica'
      ? (
        <GhostBlock
          estado="sem-metrica"
          message="Nenhuma métrica definida"
          detail="Escolha uma no inspetor para este bloco buscar o próprio dado."
        >
          {ghost}
        </GhostBlock>
      )
      : (
        <GhostBlock
          estado="vazio"
          message="Sem dados no período"
          detail="A consulta rodou e não devolveu linhas."
        >
          {ghost}
        </GhostBlock>
      );
  }

  return (
    <WithFamilyFloor block={block}>
      <RenderBlock {...props} />
    </WithFamilyFloor>
  );
}

function RenderBlock({
  block,
  loading = false,
  expandable = false,
}: CanvasBlockRendererProps) {
  switch (block.type) {
    case 'text':
      // Texto vem do próprio template, não da métrica — só entra em esqueleto
      // se depender de dado.
      return loading && block.metricId ? <BlockLoadingText /> : <TextBlock block={block} />;
    case 'kpi':
      return <SingleKpiBlock block={block} loading={loading} expandable={expandable} />;
    case 'kpis':
      return <KpiBlock block={block} loading={loading} expandable={expandable} />;
    case 'chart':
      // O card (título e moldura) permanece durante o carregamento: some só a
      // área de plotagem. Assim o usuário já lê o que está por vir.
      return (
        <ChartWidget
          title={block.title ?? ''}
          subtitle={block.subtitle}
          height={HEIGHT.grafico}
          expandable={expandable && !loading}
          badge={block.ignorePeriodFilter
            ? <NoPeriodBadge />
            : <PeriodBadge band={comparisonBand(block.data)} />}
        >
          {loading ? <BlockLoadingChart /> : <ChartBlock block={block} height="100%" />}
        </ChartWidget>
      );
    case 'table':
      return loading ? <BlockLoadingTable /> : <TableBlock block={block} />;
    case 'donut':
      return (
        <ChartWidget
          title={block.title ?? ''}
          subtitle={block.subtitle}
          // A barra de linha única mede ~70px contra os 240px da rosca; manter
          // a altura da rosca deixaria 170px de card vazio embaixo dela.
          height={block.display === 'bar' ? 90 : HEIGHT.conjunto}
          expandable={expandable && !loading}
        >
          {loading ? <BlockLoadingDonut /> : <DonutBlock block={block} />}
        </ChartWidget>
      );
    /*
     * Estes quatro desenham a própria casca (`BlockCard`) porque o conteúdo
     * deles é o card — não há área de plotagem separada do cabeçalho.
     *
     * `expandable` chega a eles como a qualquer outro. Não chegava, e o efeito
     * era de affordance: numa linha com um `progress` ao lado de um `kpi`, o
     * mouse passava nos dois e só um respondia — sem hover na borda, sem foco
     * por teclado, sem modal de análise. Não era decisão de produto; era um
     * parâmetro que eu esqueci de repassar.
     */
    case 'targets':
      return <TargetsBlock block={block} loading={loading} expandable={expandable} />;
    case 'progress':
      return <ProgressBlock block={block} loading={loading} expandable={expandable} />;
    case 'comparison':
      return <ComparisonBlock block={block} loading={loading} expandable={expandable} />;
    case 'sparkrows':
      return <SparkRowsBlock block={block} loading={loading} expandable={expandable} />;
    case 'scatter':
      return (
        <ChartWidget
          title={block.title ?? ''}
          subtitle={block.subtitle}
          height={HEIGHT.grafico}
          expandable={expandable && !loading}
        >
          {loading ? <BlockLoadingChart /> : <ScatterBlock block={block} height="100%" />}
        </ChartWidget>
      );
    case 'heatmap': {
      // A matriz é a única que cresce com o dado: 8 safras em 240px dariam
      // células de 24px, e o rótulo do eixo não caberia entre elas. 32px por
      // linha é o piso em que o rótulo ainda se lê.
      const vintages = new Set((block.cells ?? []).map((c) => c.row)).size;
      const matrixHeight = Math.max(HEIGHT.conjunto, vintages * 32 + 48);
      return (
        <ChartWidget
          title={block.title ?? ''}
          subtitle={block.subtitle}
          height={matrixHeight}
          expandable={expandable && !loading}
        >
          {loading ? <BlockLoadingMatrix /> : <HeatmapBlock block={block} height="100%" />}
        </ChartWidget>
      );
    }
    case 'funnel':
    case 'sankey':
    case 'boxplot':
    case 'treemap': {
      // Os quatro são plotagem pura: título e moldura do ChartWidget, conteúdo
      // preenchendo a altura da linha.
      const Drawing = {
        funnel: FunnelBlock, sankey: SankeyBlock,
        boxplot: BoxplotBlock, treemap: TreemapBlock,
      }[block.type] as (p: { block: never; height?: number | string }) => React.ReactElement;
      // Só o boxplot é plotagem cartesiana; os outros três têm geometria
      // própria, e um retângulo cinza no lugar delas move o card quando o dado
      // chega.
      const Skeleton = {
        funnel: BlockLoadingFunnel, sankey: BlockLoadingSankey,
        treemap: BlockLoadingTreemap, boxplot: BlockLoadingChart,
      }[block.type];
      return (
        <ChartWidget
          title={block.title ?? ''}
          subtitle={block.subtitle}
          height={block.type === 'treemap' ? HEIGHT.conjunto : HEIGHT.grafico}
          expandable={expandable && !loading}
        >
          {loading ? <Skeleton /> : <Drawing block={block as never} height="100%" />}
        </ChartWidget>
      );
    }
    case 'gauge':
      // O gauge carrega dentro do próprio card: o rótulo e o mínimo do
      // covenant vêm do template e continuam legíveis enquanto o valor não
      // chega — e o card não muda de altura quando ele chega.
      return <GaugeBlock block={block} loading={loading} expandable={expandable} />;
    default:
      return null;
  }
}
