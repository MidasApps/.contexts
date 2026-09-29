import { describe, it, expect } from 'vitest';
import {
  buildBlockTypeIndex,
  createUpdateChartBlockTool,
  createUpdateKpiBlockTool,
  createUpdateTextBlockTool,
  createUpdateTableBlockTool,
} from './update-block';
import type { CanvasPageContext } from '@/shared/config/agents/types';

const developmentPage: CanvasPageContext[] = [
  {
    id: 'empreendimento',
    title: 'Empreendimento',
    blocks: [
      { id: 'kpi-emp-vgv', type: 'kpi', label: 'Projeto VGV' },
      { id: 'chart-evolucao', type: 'chart', title: 'Evolução' },
      { id: 'text-nota-saldo', type: 'text' },
    ],
    layout: [{ rowIndex: 0, blockIds: ['kpi-emp-vgv', 'chart-evolucao', 'text-nota-saldo'] }],
  },
];

/** Executa a tool como o runtime do AI SDK executa. */
async function run(tool: unknown, input: Record<string, unknown>) {
  const t = tool as { execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> };
  return t.execute(input);
}

describe('buildBlockTypeIndex', () => {
  it('indexa id → tipo de todas as páginas', () => {
    expect(buildBlockTypeIndex(developmentPage)).toEqual({
      'kpi-emp-vgv': 'kpi',
      'chart-evolucao': 'chart',
      'text-nota-saldo': 'text',
    });
  });

  it('sem páginas devolve índice vazio', () => {
    expect(buildBlockTypeIndex([])).toEqual({});
  });
});

describe('update_*_block — alvo de tipo errado', () => {
  const index = buildBlockTypeIndex(developmentPage);

  /**
   * O caso real: com a página "Empreendimento" (16 KPIs, nenhum gráfico), o
   * pedido "mudar esse gráfico para colunas" levava o agente a chamar
   * `update_chart_block` num KPI. O store passou a recusar o merge, mas em
   * silêncio — e o agente seguia anunciando "Prontinho! O gráfico foi
   * alterado". Recusar aqui devolve o erro a QUEM pode corrigir e contar a
   * verdade: o próprio modelo, no mesmo turno.
   */
  it('recusa update_chart_block sobre um KPI e explica o motivo', async () => {
    const r = await run(createUpdateChartBlockTool(index), {
      blockId: 'kpi-emp-vgv',
      chartType: 'bar',
    });

    expect(r.ok).toBe(false);
    expect(r.error).toBe('BLOCK_TYPE_MISMATCH');
    expect(r.actualType).toBe('kpi');
    expect(r.expectedType).toBe('chart');
    // Sem `action`, o cliente não aplica nada no canvas.
    expect(r.action).toBeUndefined();
    expect(String(r.message)).toContain('kpi-emp-vgv');
  });

  it('recusa update_kpi_block sobre um gráfico', async () => {
    const r = await run(createUpdateKpiBlockTool(index), {
      blockId: 'chart-evolucao',
      value: 'R$ 1,00',
    });
    expect(r.error).toBe('BLOCK_TYPE_MISMATCH');
    expect(r.actualType).toBe('chart');
  });

  it('recusa update_text_block sobre um KPI', async () => {
    const r = await run(createUpdateTextBlockTool(index), {
      blockId: 'kpi-emp-vgv',
      content: 'nota',
    });
    expect(r.error).toBe('BLOCK_TYPE_MISMATCH');
  });

  it('recusa update_table_block sobre um texto', async () => {
    const r = await run(createUpdateTableBlockTool(index), {
      blockId: 'text-nota-saldo',
      title: 'Tabela',
    });
    expect(r.error).toBe('BLOCK_TYPE_MISMATCH');
  });
});

describe('update_*_block — alvo válido', () => {
  const index = buildBlockTypeIndex(developmentPage);

  it('aceita update_chart_block sobre um gráfico', async () => {
    const r = await run(createUpdateChartBlockTool(index), {
      blockId: 'chart-evolucao',
      chartType: 'bar',
    });
    expect(r.action).toBe('update_block');
    expect(r.updates).toEqual({ type: 'chart', chartType: 'bar' });
  });

  it('aceita update_kpi_block sobre um KPI, omitindo campos não informados', async () => {
    const r = await run(createUpdateKpiBlockTool(index), {
      blockId: 'kpi-emp-vgv',
      value: 'R$ 120,00 mi',
    });
    expect(r.action).toBe('update_block');
    expect(r.updates).toEqual({ type: 'kpi', value: 'R$ 120,00 mi' });
  });

  /**
   * O renderizador sempre soube desenhar cor por série, linha de referência,
   * barra horizontal, empilhado 100% e série tracejada — mas a tool expunha só
   * dados e tipo, então nada disso era alcançável por chat.
   */
  it('repassa os controles de apresentação do gráfico', async () => {
    const r = await run(createUpdateChartBlockTool(index), {
      blockId: 'chart-evolucao',
      colors: ['#6ECB8A', '#F27C7C'],
      dashedKeys: ['projetado'],
      referenceLines: [{ y: 1.2, label: 'Mínimo do covenant', dashed: true }],
      layout: 'horizontal',
      stackOffset: 'expand',
      subtitle: 'Últimos 12 meses',
    });

    expect(r.action).toBe('update_block');
    expect(r.updates).toEqual({
      type: 'chart',
      colors: ['#6ECB8A', '#F27C7C'],
      dashedKeys: ['projetado'],
      referenceLines: [{ y: 1.2, label: 'Mínimo do covenant', dashed: true }],
      layout: 'horizontal',
      stackOffset: 'expand',
      subtitle: 'Últimos 12 meses',
    });
  });

  // O update é parcial: o que não veio não pode aparecer no payload, senão o
  // merge sobrescreveria com `undefined` o que já estava no bloco.
  it('não inventa campo que não foi informado', async () => {
    const r = await run(createUpdateChartBlockTool(index), {
      blockId: 'chart-evolucao',
      title: 'Só o título',
    });
    expect(r.updates).toEqual({ type: 'chart', title: 'Só o título' });
  });

  /**
   * Bloco ausente do índice pode ter nascido neste mesmo turno (add_*_block,
   * fill_block) — o índice é o retrato de quando a requisição chegou. Barrar
   * o desconhecido quebraria criar-e-ajustar na mesma conversa.
   */
  it('deixa passar bloco desconhecido — pode ter sido criado neste turno', async () => {
    const r = await run(createUpdateChartBlockTool(index), {
      blockId: 'chart-recem-criado',
      chartType: 'line',
    });
    expect(r.action).toBe('update_block');
  });

  it('sem índice nenhum, mantém o comportamento permissivo', async () => {
    const r = await run(createUpdateChartBlockTool(), {
      blockId: 'kpi-emp-vgv',
      chartType: 'bar',
    });
    expect(r.action).toBe('update_block');
  });
});
