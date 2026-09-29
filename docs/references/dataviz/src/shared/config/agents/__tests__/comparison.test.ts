import { describe, it, expect } from 'vitest';
import { COMPARISON_BY_BLOCK, supportsComparison, comparisonForBlock } from '../comparison';
import { authorableSpecs } from '@/features/report-authoring/schema/block-specs';

/**
 * O fato "este bloco responde ao comparativo" tem UM dono.
 *
 * Nasceu como três strings dentro de `useReportData`, e o contrato que a IA lê
 * não o mencionava — ela não tinha como preferir um bloco que responde nem
 * avisar que escolheu um que não responde. Este teste existe para que a lista
 * e o desenho não se separem de novo: é a terceira vez nesta área que uma
 * capacidade existe de um lado sem ninguém do outro.
 */
describe('contrato do modo comparativo', () => {
  /*
   * KPI, gauge e progresso são a mesma leitura — um número que resume o
   * período — e por isso mostram o MESMO selo. Deixar dois de fora fazia o
   * modo parecer quebrado em metade dos cartões de covenant.
   */
  it.each(['chart', 'kpi', 'gauge', 'progress', 'comparison'])(
    '%s declara o que faz no comparativo',
    (blockType) => {
      expect(supportsComparison(blockType)).toBe(true);
      expect(comparisonForBlock(blockType)).toBeTruthy();
    },
  );

  /*
   * `false` não é defeito: cascata, histograma e pareto derivam o desenho do
   * próprio período; rosca e tabela precisariam de outro desenho.
   */
  it.each(['donut', 'table', 'targets', 'heatmap', 'funnel', 'treemap', 'scatter', 'sankey'])(
    '%s não promete comparativo',
    (blockType) => {
      expect(supportsComparison(blockType)).toBe(false);
      expect(comparisonForBlock(blockType)).toBeUndefined();
    },
  );

  it('toda entrada descreve O QUE o bloco faz, não só que faz', () => {
    for (const [blockType, sentence] of Object.entries(COMPARISON_BY_BLOCK)) {
      expect(sentence, `${blockType} sem descrição útil`).toBeTruthy();
      expect(sentence!.length, `${blockType} descreve pouco`).toBeGreaterThan(40);
    }
  });

  /**
   * Só tipo que existe no contrato pode aparecer aqui — uma entrada órfã
   * prometeria ao modelo um bloco que ele não pode criar.
   */
  it('não promete comparativo para tipo fora do contrato', () => {
    const fromContract = new Set(authorableSpecs().map((s) => s.type));
    for (const blockType of Object.keys(COMPARISON_BY_BLOCK)) {
      expect(fromContract.has(blockType as never), `${blockType} não é um bloco autorável`).toBe(true);
    }
  });
});
