import { describe, it, expect } from 'vitest';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { describesSameBlocks, mergeDataIntoMap } from '../useReportData';

/**
 * Regressão: acrescentar bloco SEM métrica congelava a página inteira em
 * esqueleto.
 *
 * `populatedBlockMap` é um clone do `blockMap` do instante do fetch, e
 * `describesSameBlocks` comparava a contagem de TODAS as chaves. Quando a IA
 * acrescentava um cabeçalho de texto depois que o dado já tinha chegado:
 *
 *   1. o `blockMap` ganhava chaves e o mapa populado não;
 *   2. a comparação passava a devolver `false`;
 *   3. `awaitingFirstData` virava `true` e TODO bloco caía para esqueleto;
 *   4. e o `cacheKey` não mudava — texto não acrescenta métrica —, então o
 *      efeito de busca saía pelo `fetchedRef.current === cacheKey` e nunca
 *      refazia. A página travava assim para sempre.
 *
 * Latente enquanto bloco só nascia de template (conjunto fixo, buscado de uma
 * vez). A IA acrescentando bloco depois do fetch é o caminho que expôs.
 */

const kpi = (id: string, metricId: string, value?: string): CanvasBlock =>
  ({ id, type: 'kpi', label: id, metricId, ...(value ? { value } : {}) }) as CanvasBlock;
const text = (id: string): CanvasBlock =>
  ({ id, type: 'text', content: `## ${id}` }) as CanvasBlock;

describe('describesSameBlocks — bloco sem métrica não invalida o dado', () => {
  it('reconhece o dado como sendo deste relatório após entrar um cabeçalho de texto', () => {
    const populated = { k1: kpi('k1', 'covenants.contratos_total', '1.234') };
    const current = { k1: kpi('k1', 'covenants.contratos_total'), t1: text('t1') };
    expect(describesSameBlocks(populated, current)).toBe(true);
  });

  it('bloco de dado NOVO ainda invalida — ele precisa de busca', () => {
    const populated = { k1: kpi('k1', 'covenants.contratos_total', '1.234') };
    const current = {
      k1: kpi('k1', 'covenants.contratos_total'),
      k2: kpi('k2', 'covenants.inadimplencia_pct'),
    };
    expect(describesSameBlocks(populated, current)).toBe(false);
  });

  it('sem bloco de dado nenhum, não há dado a descrever', () => {
    expect(describesSameBlocks({ t1: text('t1') }, { t1: text('t1') })).toBe(false);
  });

  it('mapa de outro relatório continua sendo recusado', () => {
    const populated = { k1: kpi('k1', 'covenants.contratos_total', '1.234') };
    const other = { k9: kpi('k9', 'covenants.emp_vgv') };
    expect(describesSameBlocks(populated, other)).toBe(false);
  });
});

describe('mergeDataIntoMap', () => {
  it('mantém o bloco que entrou depois do fetch, em vez de sumir com ele', () => {
    const populated = { k1: kpi('k1', 'covenants.contratos_total', '1.234') };
    const current = { k1: kpi('k1', 'covenants.contratos_total'), t1: text('t1') };
    const output = mergeDataIntoMap(current, populated);
    expect(Object.keys(output).sort()).toEqual(['k1', 't1']);
    expect((output.k1 as { value?: string }).value).toBe('1.234');
  });

  // A configuração vem do mapa ATUAL: quem edita o rótulo depois do fetch não
  // pode ver o rótulo antigo voltar junto com o número.
  it('dado vem do populado, configuração vem do atual', () => {
    const populated = { k1: kpi('k1', 'covenants.contratos_total', '1.234') };
    const current = { k1: { ...kpi('k1', 'covenants.contratos_total'), label: 'Novo rótulo' } as CanvasBlock };
    const output = mergeDataIntoMap(current, populated);
    expect((output.k1 as { label: string }).label).toBe('Novo rótulo');
    expect((output.k1 as { value?: string }).value).toBe('1.234');
  });

  it('sem mapa populado, devolve o atual intacto', () => {
    const current = { t1: text('t1') };
    expect(mergeDataIntoMap(current, null)).toBe(current);
  });
});
