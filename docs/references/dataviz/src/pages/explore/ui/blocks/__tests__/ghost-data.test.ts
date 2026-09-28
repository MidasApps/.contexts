import { describe, it, expect } from 'vitest';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { authorableSpecs, blockSpec } from '@/features/report-authoring/schema/block-specs';
import { ghostData, dataStateOf, hasData } from '../ghost-data';

/**
 * Todo bloco precisa saber dizer que está vazio.
 *
 * `hasData` é um `switch` com `default: true` — desenho deliberado, porque
 * `kpis` e `skeleton` são internos e nunca passam pelo pipeline. O preço é
 * que um tipo NOVO cai no default em silêncio e nunca mostra vazio: ele
 * desenharia o template cru para sempre, que é o defeito de "0,00x vermelho
 * antes do dado chegar" de volta, só que permanente.
 *
 * Este teste deriva a lista do contrato, e por isso reprova a omissão em vez
 * de a descobrir numa captura de tela.
 */

/** Um bloco mínimo do tipo, SEM nada que o pipeline preencha. */
function emptyBlock(type: string): CanvasBlock {
  const base = { id: 'x', type, metricId: 'm' } as Record<string, unknown>;
  // Só os campos obrigatórios do TIPO — nunca os de dado.
  const requiredFields: Record<string, Record<string, unknown>> = {
    text: { content: '' },
    kpi: { label: 'L' },
    gauge: { label: 'L', threshold: 1.2, value: Number.NaN },
    progress: { label: 'L', target: 100 },
    comparison: { label: 'L' },
    targets: { items: [] },
    sparkrows: { series: [] },
    donut: { slices: [] },
    chart: { chartType: 'line', xAxisKey: 'mes', dataKeys: ['v'], data: [] },
    scatter: { points: [] },
    heatmap: { cells: [] },
    table: { columns: [{ header: 'H', accessorKey: 'h' }], rows: [] },
  };
  return { ...base, ...(requiredFields[type] ?? {}) } as unknown as CanvasBlock;
}

describe('estado vazio — cobertura', () => {
  it('todo bloco autorável reconhece o próprio vazio', () => {
    for (const spec of authorableSpecs()) {
      const block = emptyBlock(spec.type);
      expect(hasData(block), `${spec.type} não reconhece que está vazio`).toBe(false);
    }
  });

  it('todo bloco autorável reconhece que TEM dado quando tem', () => {
    for (const spec of authorableSpecs()) {
      const withData = ghostData(emptyBlock(spec.type));
      expect(hasData(withData), `${spec.type} não reconhece o próprio dado`).toBe(true);
    }
  });

  /**
   * "Sem dados no período" é FALSO para um bloco recém-criado na paleta: ele
   * não tem período nem consulta, tem um campo em branco. A distinção manda o
   * autor para o inspetor em vez de para o SQL.
   */
  it('sem métrica é um estado próprio, diferente de vazio', () => {
    for (const spec of authorableSpecs()) {
      if (spec.accepts.length === 0) continue;

      const withoutMetric = { ...emptyBlock(spec.type), metricId: undefined } as CanvasBlock;
      expect(dataStateOf(withoutMetric, true), `${spec.type} sem métrica`).toBe('sem-metrica');

      const withMetric = emptyBlock(spec.type);
      expect(dataStateOf(withMetric, true), `${spec.type} com métrica e sem linha`).toBe('vazio');
    }
  });

  /** Texto não vem de métrica, mas card com título e nada dentro é vazio igual. */
  it('texto sem conteúdo é vazio; com conteúdo, não', () => {
    const empty = { id: 't', type: 'text', content: '   ' } as CanvasBlock;
    expect(dataStateOf(empty, false)).toBe('vazio');

    const full = { id: 't', type: 'text', content: '### Seção' } as CanvasBlock;
    expect(dataStateOf(full, false)).toBe('ok');
  });

  /**
   * O fantasma tem de parecer ESTE bloco: um donut fantasma com o título de
   * outro bloco, ou sem título nenhum, não ajuda a reconhecer o que falhou.
   */
  it('o fantasma preserva a configuração do bloco', () => {
    const donut = {
      id: 'd', type: 'donut', metricId: 'm', title: 'Recebíveis', slices: [],
    } as CanvasBlock;
    const ghost = ghostData(donut) as typeof donut & { title?: string };
    expect(ghost.title).toBe('Recebíveis');
    expect(ghost.id).toBe('d');
  });

  /**
   * Um gauge fantasma abaixo do mínimo pintaria a borda de vermelho e sugeriria
   * rompimento — um veredito inventado sobre um covenant que não carregou.
   */
  it('o gauge fantasma nasce acima do limite, nunca rompido', () => {
    const gauge = {
      id: 'g', type: 'gauge', metricId: 'm', label: 'L', threshold: 1.2, value: Number.NaN,
    } as CanvasBlock;
    const ghost = ghostData(gauge) as typeof gauge & { value: number; threshold: number };
    expect(ghost.value).toBeGreaterThan(ghost.threshold);
  });

  it('o fantasma cobre todo tipo que o contrato deixa a IA criar', () => {
    for (const spec of authorableSpecs()) {
      const block = emptyBlock(spec.type);
      const ghost = ghostData(block);
      expect(ghost, `${spec.type} sem fantasma`).not.toBe(block);
      expect(blockSpec(spec.type).label.length).toBeGreaterThan(0);
    }
  });
});
