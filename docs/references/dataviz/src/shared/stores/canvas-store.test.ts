import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCanvasStore } from './canvas-store';
import type { CanvasBlock } from '@/shared/config/agents/types';

const kpi = {
  id: 'kpi-emp-vgv',
  type: 'kpi',
  label: 'Projeto VGV',
  value: 'R$ 115,55 mi',
} as unknown as CanvasBlock;

const chart = {
  id: 'chart-evolucao',
  type: 'chart',
  chartType: 'line',
  title: 'Evolução',
  xAxisKey: 'mes',
  dataKeys: ['valor'],
  data: [{ mes: '2026-01', valor: 10 }],
} as unknown as CanvasBlock;

function pageWith(...blocks: CanvasBlock[]) {
  useCanvasStore.getState().reset();
  useCanvasStore.getState().createPage('Empreendimento');
  for (const b of blocks) useCanvasStore.getState().addBlock(0, b);
}

function block(id: string) {
  return useCanvasStore.getState().pages[0]!.blockMap[id]!;
}

describe('canvas-store — updateBlockContent', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    vi.restoreAllMocks();
  });

  /**
   * O defeito que este teste tranca: `update_chart_block` carrega
   * `type: 'chart'` no payload. Aplicado a um KPI (a IA erra o alvo quando não
   * conhece os tipos dos blocos), o merge raso produzia um "chart" com os
   * campos do KPI e sem `data`/`dataKeys` — um bloco que não existe em lugar
   * nenhum do domínio, e que derrubava a renderização.
   *
   * Update parcial não sabe construir um bloco de outro tipo: recusa.
   */
  it('recusa update que troca o tipo do bloco', () => {
    pageWith(kpi);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    useCanvasStore.getState().updateBlockContent(0, 'kpi-emp-vgv', {
      type: 'chart',
      chartType: 'bar',
    } as Partial<CanvasBlock>);

    expect(block('kpi-emp-vgv').type).toBe('kpi');
    expect(block('kpi-emp-vgv')).toEqual(kpi);
  });

  it('avisa no console quando recusa — o erro precisa ser diagnosticável', () => {
    pageWith(kpi);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    useCanvasStore.getState().updateBlockContent(0, 'kpi-emp-vgv', {
      type: 'chart',
    } as Partial<CanvasBlock>);

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('kpi-emp-vgv');
  });

  it('aceita update do mesmo tipo', () => {
    pageWith(chart);

    useCanvasStore.getState().updateBlockContent(0, 'chart-evolucao', {
      type: 'chart',
      chartType: 'bar',
    } as Partial<CanvasBlock>);

    const updated = block('chart-evolucao') as unknown as { chartType: string; data: unknown[] };
    expect(updated.chartType).toBe('bar');
    // O merge continua preservando o que não veio no payload.
    expect(updated.data).toHaveLength(1);
  });

  it('aceita update sem `type` (largura, inspetor de template)', () => {
    pageWith(kpi);

    useCanvasStore.getState().updateBlockContent(0, 'kpi-emp-vgv', {
      colSpan: 3,
    } as Partial<CanvasBlock>);

    expect(block('kpi-emp-vgv').colSpan).toBe(3);
    expect(block('kpi-emp-vgv').type).toBe('kpi');
  });
});

/**
 * `addBlock` sempre abria linha nova: três KPIs de 1/3 viravam três linhas de um
 * card, com dois terços de vazio ao lado de cada um. Só apareceu quando o
 * assistente passou a criar bloco a bloco — template já traz o layout pronto.
 */
/**
 * O encaixe mede em colunas do grid de 6, pela largura do contrato de bloco.
 *
 * Media contra um orçamento de 3 com tabela de tipo própria, enquanto o renderer
 * dividia por 6 — três KPIs "fechavam" a linha ocupando metade dela na tela.
 */
describe('addBlock — encaixe na linha', () => {
  const kpi = (id: string, colSpan?: number) =>
    ({ id, type: 'kpi', label: id, ...(colSpan ? { colSpan } : {}) }) as never;
  const chart = (id: string, colSpan?: number) =>
    ({ id, type: 'chart', chartType: 'line', xAxisKey: 'x', dataKeys: ['y'], ...(colSpan ? { colSpan } : {}) }) as never;

  function newPage() {
    useCanvasStore.getState().reset();
    useCanvasStore.getState().createPage('P');
    return useCanvasStore.getState();
  }

  it('três KPIs na largura padrão fecham a linha de 6', () => {
    newPage();
    for (const id of ['a', 'b', 'c']) useCanvasStore.getState().addBlock(0, kpi(id));
    const layout = useCanvasStore.getState().pages[0]!.layout;
    expect(layout).toHaveLength(1);
    expect(layout[0]!.blockIds).toEqual(['a', 'b', 'c']);
  });

  it('o quarto KPI abre linha nova', () => {
    newPage();
    for (const id of ['a', 'b', 'c', 'd']) useCanvasStore.getState().addBlock(0, kpi(id));
    const layout = useCanvasStore.getState().pages[0]!.layout;
    expect(layout).toHaveLength(2);
    expect(layout[1]!.blockIds).toEqual(['d']);
  });

  it('respeita colSpan: um gráfico de 4 e um KPI de 2 dividem a linha', () => {
    newPage();
    useCanvasStore.getState().addBlock(0, chart('largo', 4));
    useCanvasStore.getState().addBlock(0, kpi('estreito', 2));
    useCanvasStore.getState().addBlock(0, kpi('sobra', 2));
    const layout = useCanvasStore.getState().pages[0]!.layout;
    expect(layout[0]!.blockIds).toEqual(['largo', 'estreito']);
    expect(layout[1]!.blockIds).toEqual(['sobra']);
  });

  // Um bloco que declara menos que o mínimo do tipo não pode "caber" a mais.
  it('largura abaixo do mínimo do tipo é medida pelo mínimo', () => {
    newPage();
    for (const id of ['a', 'b', 'c', 'd']) useCanvasStore.getState().addBlock(0, kpi(id, 1));
    const layout = useCanvasStore.getState().pages[0]!.layout;
    expect(layout[0]!.blockIds).toEqual(['a', 'b', 'c']);
    expect(layout[1]!.blockIds).toEqual(['d']);
  });

  // Posição explícita é escolha de quem chamou, não do empacotador.
  it('com position explícita, linha própria na posição pedida', () => {
    newPage();
    useCanvasStore.getState().addBlock(0, kpi('a'));
    useCanvasStore.getState().addBlock(0, kpi('topo'), 0);
    const layout = useCanvasStore.getState().pages[0]!.layout;
    expect(layout[0]!.blockIds).toEqual(['topo']);
    expect(layout[1]!.blockIds).toEqual(['a']);
  });
});
