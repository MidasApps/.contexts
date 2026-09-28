import type { CanvasBlock } from '@/shared/config/agents/types';

/**
 * O dado de mentira que desenha o FANTASMA por trás de "vazio" e "erro".
 *
 * A ideia: em vez de uma caixa cinza ou um travessão, o bloco desenha a si
 * mesmo com números plausíveis, esmaecido, e a mensagem vem por cima. O leitor
 * reconhece de relance a forma do que deveria estar ali — um donut, uma série,
 * uma matriz — em vez de encarar um retângulo que não diz nem que tipo de
 * bloco falhou.
 *
 * ⚠️ Estes números NUNCA são exibidos como dado: quem os desenha aplica
 * opacidade baixa, remove interação e põe a mensagem em cima. Um fantasma
 * legível seria pior que caixa cinza — passaria por número de verdade.
 */

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

/** Curva suave e sem sentido — só a forma importa. */
function series(base: number, amplitude: number): number[] {
  return MONTHS.map((_, i) => base + Math.sin(i / 1.6) * amplitude + i * (amplitude / 5));
}

/**
 * Uma cópia do bloco com dado plausível para o desenho de fundo.
 *
 * Preserva rótulo, título e configuração — o fantasma tem de parecer ESTE
 * bloco, não um bloco genérico.
 */
export function ghostData(block: CanvasBlock): CanvasBlock {
  switch (block.type) {
    case 'text':
      // Texto também precisa de fantasma: sem ele o bloco vazio desenharia a
      // mensagem sobre nada, e o card perderia a altura que teria com conteúdo.
      return {
        ...block,
        content: '### Título da seção\n\nLinha de apoio explicando o que vem a seguir '
          + 'nesta parte do relatório.',
      };
    case 'kpi':
      return { ...block, value: 'R$ 12,3 mi', sparklineData: series(40, 8), sparklineMonths: MONTHS };
    case 'gauge': {
      // Acima do limite: um fantasma "rompido" pintaria a borda de vermelho e
      // sugeriria um veredito que não existe.
      const limit = block.threshold || 1;
      return { ...block, value: limit * 1.18 };
    }
    case 'progress':
      return { ...block, value: (block.target || 100) * 0.62 };
    case 'comparison':
      return { ...block, current: 48.2, previous: 51.6 };
    case 'targets':
      return {
        ...block,
        items: [
          { label: 'Indicador A', value: 1.4, target: 1.2 },
          { label: 'Indicador B', value: 1.25, target: 1.2 },
          { label: 'Indicador C', value: 0.98, target: 1.2 },
        ],
      };
    case 'sparkrows':
      return {
        ...block,
        series: [
          { name: 'serie_a', points: series(30, 6) },
          { name: 'serie_b', points: series(18, 4) },
          { name: 'serie_c', points: series(46, 9) },
        ],
      };
    case 'donut':
      return {
        ...block,
        slices: [
          { name: 'A', value: 42 }, { name: 'B', value: 28 },
          { name: 'C', value: 18 }, { name: 'D', value: 12 },
        ],
      };
    case 'chart': {
      const keys = block.dataKeys?.length ? block.dataKeys : ['value'];
      return {
        ...block,
        data: MONTHS.map((month, i) => {
          const row: Record<string, string | number> = { [block.xAxisKey || 'bucket']: month };
          keys.forEach((key, j) => {
            row[key] = 20 + Math.sin((i + j) / 1.4) * 8 + j * 12 + i * 2;
          });
          return row;
        }),
      };
    }
    case 'scatter':
      return {
        ...block,
        points: Array.from({ length: 24 }, (_, i) => ({
          x: 0.4 + i * 0.022,
          y: 8 + Math.sin(i / 2.2) * 26 + i * 3.4,
        })),
      };
    case 'heatmap':
      return {
        ...block,
        cells: ['2023', '2024', '2025'].flatMap((row, r) =>
          ['3m', '6m', '12m', '18m'].map((col, c) => ({
            row, col, value: 1 + r * 0.8 + c * 1.1,
          })),
        ),
      };
    case 'funnel':
      return {
        ...block,
        etapas: [
          { etapa: 'Etapa 1', value: 1840 }, { etapa: 'Etapa 2', value: 1310 },
          { etapa: 'Etapa 3', value: 940 }, { etapa: 'Etapa 4', value: 812 },
        ],
      };
    case 'sankey': {
      const ordem = block.ordem?.length ? block.ordem : ['A', 'B', 'C'];
      return {
        ...block,
        ordem,
        fluxos: ordem.flatMap((origem, i) =>
          ordem.slice(i, i + 2).map((destino, j) => ({
            origem, destino, value: 400 - i * 90 - j * 140,
          })),
        ).filter((f) => f.value > 0),
      };
    }
    case 'boxplot':
      return {
        ...block,
        grupos: ['G1', 'G2', 'G3'].map((grupo, i) => ({
          grupo,
          min: 30 + i * 3, q1: 48 + i * 4, mediana: 58 + i * 5,
          q3: 68 + i * 5, max: 84 + i * 4,
        })),
      };
    case 'treemap':
      return {
        ...block,
        fatias: [
          { name: 'A', value: 48 }, { name: 'B', value: 26 }, { name: 'C', value: 14 },
          { name: 'D', value: 8 }, { name: 'E', value: 4 },
        ],
      };
    case 'table':
      return {
        ...block,
        rows: Array.from({ length: 6 }, (_, i) => {
          const row: Record<string, unknown> = {};
          for (const column of block.columns) {
            row[column.accessorKey] =
              column.format && column.format !== 'date' ? 1200 + i * 340 : `Item ${i + 1}`;
          }
          return row;
        }),
      };
    default:
      return block;
  }
}

/**
 * O bloco tem dado para desenhar?
 *
 * É a pergunta que decide entre conteúdo e fantasma. Cada tipo guarda o dado
 * num campo diferente — a lista espelha `DATA_FIELDS` de
 * `@/shared/lib/report/block-data`, que é quem sabe removê-los.
 *
 * ⚠️ Tipo novo sem `case` aqui cai no `default: true` e NUNCA mostra vazio: ele
 * desenharia o template cru para sempre. `ghost-data.test.ts` deriva a lista do
 * contrato e reprova a omissão.
 */
export function hasData(block: CanvasBlock): boolean {
  switch (block.type) {
    case 'kpi': return block.value !== undefined && block.value !== '—';
    case 'gauge': return Number.isFinite(block.value);
    case 'progress': return block.value !== undefined && Number.isFinite(block.value);
    case 'comparison': return block.current !== undefined && block.previous !== undefined;
    case 'targets': return (block.items?.length ?? 0) > 0;
    case 'sparkrows': return (block.series?.length ?? 0) > 0;
    case 'donut': return (block.slices?.length ?? 0) > 0;
    case 'chart': return (block.data?.length ?? 0) > 0;
    case 'scatter': return (block.points?.length ?? 0) > 0;
    case 'heatmap': return (block.cells?.length ?? 0) > 0;
    case 'table': return (block.rows?.length ?? 0) > 0;
    case 'funnel': return (block.etapas?.length ?? 0) > 0;
    case 'sankey': return (block.fluxos?.length ?? 0) > 0;
    case 'boxplot': return (block.grupos?.length ?? 0) > 0;
    case 'treemap': return (block.fatias?.length ?? 0) > 0;
    // Texto não vem de métrica, mas vazio ele também é: um card com um título
    // e nada dentro é pior que um card que diz que está sem conteúdo.
    case 'text': return block.content.trim().length > 0;
    // `kpis` e `skeleton` são internos: o primeiro é explodido na carga, o
    // segundo JÁ é um estado. Nenhum dos dois chega aqui pelo pipeline.
    default: return true;
  }
}

/**
 * O estado do bloco — o que decide entre conteúdo, vazio e "falta métrica".
 *
 * `sem-metrica` existe porque "Sem dados no período" é FALSO para um bloco
 * recém-criado na paleta: ele não tem período nem consulta, tem um campo em
 * branco. Dizer a mesma coisa nos dois casos manda o autor procurar defeito no
 * dado quando o que falta é configuração — e manda o leitor de um relatório
 * publicado achar que a consulta falhou.
 */
export type DataState = 'ok' | 'vazio' | 'sem-metrica';

export function dataStateOf(block: CanvasBlock, consumesMetric: boolean): DataState {
  if (hasData(block)) return 'ok';
  if (consumesMetric && !block.metricId) return 'sem-metrica';
  return 'vazio';
}
