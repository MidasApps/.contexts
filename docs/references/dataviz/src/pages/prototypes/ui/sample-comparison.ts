import type { CanvasBlock } from '@/shared/config/agents/types';
import { applyComparisonToBlock } from '@/shared/hooks/useReportData';
import { supportsComparison } from '@/shared/config/agents/comparison';

/**
 * O modo comparativo da galeria.
 *
 * Fabrica um "período anterior" e o entrega às MESMAS funções que o relatório
 * usa (`applyComparisonToBlock`). É o ponto inteiro: se a galeria desenhasse
 * a comparação por conta própria, mostraria um comportamento que não existe em
 * produção — e a página existe justamente para validar o que existe. Um bloco
 * que não muda aqui é um bloco que não muda lá.
 *
 * O que se fabrica é só o DADO de entrada. A decisão de quais blocos aceitam
 * comparação, como o número é escrito e como a série é alinhada continua toda
 * do pipeline.
 */

/** Fator aplicado ao valor atual para inventar o "anterior". */
const FACTOR = 0.86;

/**
 * As linhas que o batch teria devolvido para o período comparativo.
 *
 * Derivadas do próprio dado do bloco: assim a comparação tem a mesma ordem de
 * grandeza do que está na tela, e a diferença fica visível sem ser absurda.
 */
function comparisonRows(block: CanvasBlock): Array<Record<string, unknown>> {
  if (block.type === 'chart') {
    const data = block.data ?? [];
    const keys = block.dataKeys ?? [];
    const axis = block.xAxisKey || 'bucket';
    return data.map((row, i) => {
      const out: Record<string, unknown> = { [axis]: `anterior-${i}` };
      for (const key of keys) {
        const v = Number(row[key]);
        // Variação alternada: uma série sempre menor pareceria regra do
        // desenho, não dado. Alternar mostra cruzamento, que é o caso real
        // mais difícil de ler — e o que precisa ser validado aqui.
        out[key] = Number.isFinite(v) ? v * (i % 2 === 0 ? FACTOR : 1 / FACTOR) : v;
      }
      return out;
    });
  }

  if (block.type === 'kpi') {
    const raw = parseFloat(String(block.value ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(raw) ? [{ value: raw * FACTOR }] : [];
  }

  if (block.type === 'comparison') {
    const current = block.current;
    return Number.isFinite(current) ? [{ value: (current as number) * FACTOR }] : [];
  }

  // Gauge e progresso guardam o número cru, sem passar por formatação.
  if (block.type === 'gauge' || block.type === 'progress') {
    const current = block.value;
    return Number.isFinite(current) ? [{ value: (current as number) * FACTOR }] : [];
  }

  return [];
}

/** As linhas do período ATUAL, no formato que o pipeline entrega. */
function currentRows(block: CanvasBlock): Array<Record<string, unknown>> {
  if (block.type === 'kpi') {
    const raw = parseFloat(String(block.value ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(raw) ? [{ value: raw }] : [];
  }
  if (block.type === 'comparison') {
    return Number.isFinite(block.current) ? [{ value: block.current as number }] : [];
  }
  if (block.type === 'gauge' || block.type === 'progress') {
    return Number.isFinite(block.value) ? [{ value: block.value as number }] : [];
  }
  return [];
}

/**
 * Uma cópia do bloco com o período comparativo aplicado.
 *
 * Devolve o bloco original quando o tipo não aceita comparação — é assim que a
 * galeria mostra, sem texto nenhum, que o modo não vale para todos.
 */
export function withComparison(block: CanvasBlock): CanvasBlock {
  if (!supportsComparison(block.type)) return block;

  const comparisonRowsFor = comparisonRows(block);
  if (comparisonRowsFor.length === 0) return block;

  const copy = JSON.parse(JSON.stringify(block)) as CanvasBlock;
  applyComparisonToBlock(copy, currentRows(block), comparisonRowsFor);
  return copy;
}
