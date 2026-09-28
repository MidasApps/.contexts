import { describe, it, expect, vi } from 'vitest';
import { applyToolResult, type CanvasState } from './apply-tool-result';
import type { CanvasBlock } from '@/shared/config/agents/types';

function fakeState(pages: Array<{ blockMap: Record<string, CanvasBlock> }> = [{ blockMap: {} }]) {
  const state: CanvasState = {
    pages,
    addBlock: vi.fn(),
    removeBlock: vi.fn(),
    moveBlock: vi.fn(),
    updateBlockContent: vi.fn(),
    replaceBlock: vi.fn(),
  };
  return { estado: state, getState: () => state };
}

const kpi = { id: 'kpi-vgv', type: 'kpi', label: 'VGV' } as unknown as CanvasBlock;
const chart = { id: 'chart-evo', type: 'chart', title: 'Evolução' } as unknown as CanvasBlock;

describe('applyToolResult', () => {
  /**
   * Substituir é trocar o CONTEÚDO de um bloco, não remover e criar.
   *
   * Adicionar põe no fim da página: quem pedia para trocar o indicador do topo
   * recebia o novo lá embaixo, depois de tudo, com um buraco no lugar de
   * origem. `replaceBlock` preserva id, posição no layout e largura.
   */
  it('substitui no lugar quando a tool informa o bloco que sai', () => {
    const { estado: state, getState } = fakeState([{ blockMap: { 'kpi-vgv': kpi } }]);
    const ok = applyToolResult(
      {
        toolName: 'add_sparkrows_block',
        result: { action: 'add_block', block: chart, pageIndex: 0, substituiBlockId: 'kpi-vgv' },
      },
      { getState },
    );
    expect(ok).toBe(true);
    expect(state.replaceBlock).toHaveBeenCalledWith(0, 'kpi-vgv', { ...chart, colSpan: 3 });
    expect(state.addBlock).not.toHaveBeenCalled();
  });

  // Id que não existe mais (o modelo já tinha removido o bloco antes) não pode
  // fazer o bloco novo sumir: cai no acréscimo normal.
  it('bloco a substituir inexistente vira acréscimo, não perda', () => {
    const { estado: state, getState } = fakeState([{ blockMap: {} }]);
    applyToolResult(
      {
        toolName: 'add_chart_block',
        result: { action: 'add_block', block: chart, pageIndex: 0, substituiBlockId: 'sumiu' },
      },
      { getState },
    );
    expect(state.replaceBlock).not.toHaveBeenCalled();
    expect(state.addBlock).toHaveBeenCalled();
  });

  it('adiciona bloco na página resolvida', () => {
    const { estado: state, getState } = fakeState();
    const ok = applyToolResult(
      { toolName: 'add_chart_block', result: { action: 'add_block', block: chart, pageIndex: 0, position: 2 } },
      { getState },
    );
    expect(ok).toBe(true);
    expect(state.addBlock).toHaveBeenCalledWith(0, { ...chart, colSpan: 3 }, 2);
  });

  /*
   * Resultado de tool também chega de conversa carregada do histórico, gravada
   * quando o teto de `colSpan` era 3 e a legenda dizia "1 = 1/3". Um gráfico de
   * 1/6 tem 33px de área de plotagem.
   */
  it('ajusta largura fora da faixa antes de entregar ao store', () => {
    const { estado: state, getState } = fakeState();
    const narrow = { ...chart, colSpan: 1 } as CanvasBlock;
    applyToolResult(
      { toolName: 'add_chart_block', result: { action: 'add_block', block: narrow } },
      { getState },
    );
    expect(state.addBlock).toHaveBeenCalledWith(0, { ...chart, colSpan: 2 }, undefined);
  });

  it('lote de KPIs vira um addBlock por bloco', () => {
    const { estado: state, getState } = fakeState();
    applyToolResult(
      { toolName: 'add_kpis_block', result: { action: 'add_kpi_blocks', blocks: [kpi, chart] } },
      { getState },
    );
    expect(state.addBlock).toHaveBeenCalledTimes(2);
  });

  /**
   * A cópia do `ChatPanel` checava `action`; a do `AISidebar` só passou a checar
   * depois do bloco quebrado em produção. Com um aplicador só, a recusa vale nas
   * duas telas.
   */
  it('update recusado pela tool não mexe em nada', () => {
    const { estado: state, getState } = fakeState([{ blockMap: { 'kpi-vgv': kpi } }]);
    const ok = applyToolResult(
      {
        toolName: 'update_chart_block',
        result: { ok: false, error: 'BLOCK_TYPE_MISMATCH', blockId: 'kpi-vgv', actualType: 'kpi' },
      },
      { getState },
    );
    expect(ok).toBe(false);
    expect(state.updateBlockContent).not.toHaveBeenCalled();
  });

  it('update encontra a página em que o bloco realmente está', () => {
    const { estado: state, getState } = fakeState([
      { blockMap: { 'kpi-vgv': kpi } },
      { blockMap: { 'chart-evo': chart } },
    ]);
    applyToolResult(
      {
        toolName: 'update_chart_block',
        // `pageIndex` do servidor aponta para a página errada de propósito.
        result: { action: 'update_block', blockId: 'chart-evo', updates: { title: 'Novo' }, pageIndex: 0 },
      },
      { getState, resolvePageIndex: (i) => i ?? 0 },
    );
    expect(state.updateBlockContent).toHaveBeenCalledWith(1, 'chart-evo', { title: 'Novo' });
  });

  it('remove e move localizam o bloco pelo id', () => {
    const { estado: state, getState } = fakeState([{ blockMap: {} }, { blockMap: { 'chart-evo': chart, 'kpi-vgv': kpi } }]);
    const deps = { getState };
    applyToolResult({ toolName: 'remove_block', result: { blockId: 'chart-evo' } }, deps);
    applyToolResult(
      { toolName: 'move_block', result: { blockId: 'kpi-vgv', targetBlockId: 'chart-evo', position: 'after' } },
      deps,
    );
    expect(state.removeBlock).toHaveBeenCalledWith(1, 'chart-evo');
    expect(state.moveBlock).toHaveBeenCalledWith(1, 'kpi-vgv', 'chart-evo', 'after');
  });

  /**
   * Relatório criado no Firestore não aparece sozinho: `useGroups` só refaz o
   * fetch quando o cliente muda. Sem avisar a tela, o assistente diria "criei o
   * relatório Teste" e o seletor continuaria sem ele até o reload — o mesmo
   * padrão de "duas afirmações contraditórias na mesma tela" que a criação de
   * página já teve.
   */
  it('relatório criado avisa a tela para navegar até ele', () => {
    const { getState } = fakeState();
    const navigate = vi.fn();
    const ok = applyToolResult(
      {
        toolName: 'create_report',
        result: { action: 'report_created', groupId: 'teste', name: 'Teste' },
      },
      { getState, onReportCreated: navigate },
    );
    expect(ok).toBe(true);
    expect(navigate).toHaveBeenCalledWith({ groupId: 'teste', name: 'Teste' });
  });

  it('página de relatório criada avisa a tela para navegar', () => {
    const { getState } = fakeState();
    const navigate = vi.fn();
    const ok = applyToolResult(
      {
        toolName: 'create_report_page',
        result: { action: 'report_page_created', groupId: 'g1', reportId: 'volumetria', name: 'Volumetria' },
      },
      { getState, onReportPageCreated: navigate },
    );
    expect(ok).toBe(true);
    expect(navigate).toHaveBeenCalledWith({ groupId: 'g1', reportId: 'volumetria', name: 'Volumetria' });
  });





  /**
   * Filtro de página não é conteúdo de canvas: a ferramenta escreve direto no
   * Firestore, porque o `handleSave` grava só `blockMap`/`layout`. Quem recebe
   * precisa reler o documento, senão o seletor recém-criado só apareceria no
   * próximo carregamento — com o assistente já tendo dito "pronto".
   */
  it.each(['page_filter_added', 'page_filter_removed'])('%s avisa a tela para reler o relatório', (action) => {
    const { getState } = fakeState();
    const reload = vi.fn();

    const ok = applyToolResult(
      { toolName: 'add_page_filter', result: { action, groupId: 'g1', reportId: 'extrato' } },
      { getState, onPageFilterChanged: reload },
    );

    expect(ok).toBe(true);
    expect(reload).toHaveBeenCalledWith({ groupId: 'g1', reportId: 'extrato' });
  });

  it('resultado sem ação reconhecida — ou vazio — não aplica nada', () => {
    const { estado: state, getState } = fakeState();
    expect(applyToolResult({ toolName: 'execute_sql', result: { rows: [] } }, { getState })).toBe(false);
    expect(applyToolResult({ toolName: 'add_kpi_block', result: null }, { getState })).toBe(false);
    // `add_*` sem bloco no payload é resposta malformada, não bloco vazio.
    expect(applyToolResult({ toolName: 'add_kpi_block', result: { pageIndex: 0 } }, { getState })).toBe(false);
    for (const action of Object.values(state)) {
      if (typeof action === 'function') expect(action).not.toHaveBeenCalled();
    }
  });
});

// Métrica criada/alterada pelo chat muda o catálogo que a página usa para
// recortar o período e escalar o percentual: sem recarga, ela entrava como
// desconhecida (faixa inteira no lugar do mês).
describe('applyToolResult — ações de métrica', () => {
  it.each(['metric_created', 'metric_updated', 'metric_variant_created', 'metric_reverted'])(
    '%s pede recarga do catálogo e não toca o canvas',
    (action) => {
      const onMetricCatalogChanged = vi.fn();
      const addBlock = vi.fn();
      const handled = applyToolResult(
        { toolName: 'create_metric', result: { action, metricId: 'chat.x' } },
        { getState: () => ({ pages: [{ blockMap: {} }], addBlock } as never), onMetricCatalogChanged },
      );
      expect(handled).toBe(true);
      expect(onMetricCatalogChanged).toHaveBeenCalledTimes(1);
      expect(addBlock).not.toHaveBeenCalled();
    },
  );
});
