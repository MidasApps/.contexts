/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartBlock, mergeProjection } from '../ChartBlock';
import type { ChartBlock as ChartBlockType } from '@/shared/config/agents/types';

/**
 * O defeito que estes testes trancam: `hasNegativeValues` lia `data.some(...)`
 * ANTES da guarda `!data?.length`, que existe logo abaixo justamente para este
 * caso. Um bloco `chart` sem `data` — o que a IA produz ao aplicar
 * `update_chart_block` num bloco que não é gráfico — derrubava a página
 * inteira com "Cannot read properties of undefined (reading 'some')", e o
 * ErrorBoundary trocava o relatório por "Algo deu errado".
 *
 * Um bloco malformado é um bloco vazio na tela, nunca uma página derrubada.
 */
/**
 * Projeção não vem do banco: nenhuma consulta sobre `contratos` devolve um
 * contrato que ainda não foi assinado. O assistente calcula o futuro e grava
 * os pontos no bloco — antes disso ele conseguia projetar e não conseguia
 * desenhar, e escrevia os números num texto ao lado de um gráfico que parava
 * no último mês real.
 */
/**
 * A série que o gráfico DE FATO desenha. O Recharts não expõe os dados no DOM
 * de forma legível em happy-dom, então a composição é exercitada pela mesma
 * função pura que o componente usa.
 */
function chartSeries(block: ChartBlockType): Array<Record<string, string | number>> {
  return mergeProjection(block.data, block.projectedData, block.xAxisKey) ?? [];
}

describe('<ChartBlock> com projeção do assistente', () => {
  const withProjection = {
    id: 'p1',
    type: 'chart',
    chartType: 'line',
    title: 'Vendas acumuladas',
    xAxisKey: 'mes',
    dataKeys: ['realizado', 'projetado'],
    dashedKeys: ['projetado'],
    data: [
      { mes: '2026-05', realizado: 186 },
      { mes: '2026-06', realizado: 188 },
    ],
    projectedData: [
      { mes: '2026-06', projetado: 188 },
      { mes: '2026-07', projetado: 190 },
      { mes: '2027-06', projetado: 208 },
    ],
  } as unknown as ChartBlockType;

  /*
   * O defeito que apareceu em produção: o ponto de emenda (jun/26, repetido na
   * série projetada) virava uma SEGUNDA linha. O eixo mostrava "jun/26 jun/26"
   * e as curvas ficavam desconectadas — em nenhuma linha as duas séries tinham
   * valor ao mesmo tempo, então não havia onde uma terminar e a outra começar.
   */
  it('mês repetido na projeção não vira segundo ponto no eixo', () => {
    const data = chartSeries(withProjection);
    const months = data.map((l) => String(l.mes));
    expect(months).toEqual([...new Set(months)]);
    expect(months).toHaveLength(4); // mai, jun, jul/26 e jun/27
  });

  it('o ponto de emenda carrega as DUAS séries — é onde as linhas se encontram', () => {
    const seam = chartSeries(withProjection).find((l) => String(l.mes).startsWith('2026-06'));
    expect(seam).toMatchObject({ realizado: 188, projetado: 188 });
  });

  /* A métrica devolve o DATE_TRUNC do BigQuery (2026-06-01) e o assistente
     escreve o mês (2026-06). Os dois viram "jun/26" na tela. */
  it('emenda por ano-mês, mesmo com formatos de data diferentes dos dois lados', () => {
    const mixedFormats = {
      ...withProjection,
      data: [{ mes: '2026-06-01', realizado: 188 }],
      projectedData: [
        { mes: '2026-06', projetado: 188 },
        { mes: '2026-07', projetado: 190 },
      ],
    } as unknown as ChartBlockType;

    const data = chartSeries(mixedFormats);
    expect(data).toHaveLength(2);
    // O rótulo do eixo continua sendo o que a métrica devolveu.
    expect(data[0]).toMatchObject({ mes: '2026-06-01', realizado: 188, projetado: 188 });
  });

  it('desenha o futuro depois do histórico, na mesma série de pontos', () => {
    const { container } = render(<ChartBlock block={withProjection} />);
    // Sem os pontos projetados o gráfico cairia no estado vazio ou pararia no
    // último mês real; aqui basta provar que ele montou com os dois trechos.
    expect(container.textContent).not.toContain('Sem dados para exibir');
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
  });

  it('gráfico só de projeção (sem histórico) também desenha', () => {
    const projectionOnly = { ...withProjection, data: undefined } as unknown as ChartBlockType;
    const { container } = render(<ChartBlock block={projectionOnly} />);
    expect(container.textContent).not.toContain('Sem dados para exibir');
  });

  it('sem projeção nada muda — o gráfico segue só com o histórico', () => {
    const withoutProjection = { ...withProjection, projectedData: undefined } as unknown as ChartBlockType;
    const { container } = render(<ChartBlock block={withoutProjection} />);
    expect(container.textContent).not.toContain('Sem dados para exibir');
  });
});

describe('<ChartBlock> com bloco malformado', () => {
  it('sem `data` mostra o estado vazio em vez de quebrar', () => {
    const withoutData = {
      id: 'c1',
      type: 'chart',
      chartType: 'bar',
      title: 'Projeto VGV',
      xAxisKey: 'mes',
      dataKeys: ['valor'],
    } as unknown as ChartBlockType;

    const { container } = render(<ChartBlock block={withoutData} />);
    expect(container.textContent).toContain('Sem dados para exibir');
  });

  it('sem `dataKeys` mostra o estado vazio em vez de quebrar', () => {
    const withoutKeys = {
      id: 'c2',
      type: 'chart',
      chartType: 'bar',
      title: 'Saldo',
      xAxisKey: 'mes',
      data: [{ mes: '2026-01', valor: 10 }],
    } as unknown as ChartBlockType;

    const { container } = render(<ChartBlock block={withoutKeys} />);
    expect(container.textContent).toContain('Sem dados para exibir');
  });

  // Caso real do relatório "Empreendimento": a IA converteu um KPI em chart
  // com `update_chart_block`, e o merge preservou os campos do KPI.
  it('KPI convertido em chart por merge parcial não derruba a página', () => {
    const kpiTurnedChart = {
      id: 'kpi-emp-vgv',
      type: 'chart',
      chartType: 'bar',
      label: 'Projeto VGV',
      value: 'R$ 115,55 mi',
      metricId: 'empreendimento.vgv',
    } as unknown as ChartBlockType;

    expect(() => render(<ChartBlock block={kpiTurnedChart} />)).not.toThrow();
  });
});
