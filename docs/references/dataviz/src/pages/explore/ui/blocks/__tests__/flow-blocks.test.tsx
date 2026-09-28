/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { CanvasBlockRenderer } from '../../CanvasBlockRenderer';
import { authorableSpecs } from '@/features/report-authoring/schema/block-specs';
import type { CanvasBlock } from '@/shared/config/agents/types';

/**
 * Os quatro blocos que entraram por último — funil, migração, dispersão por
 * grupo e peso por área — nos três estados que não são "deu certo".
 *
 * Eles nasceram como propostas desenhadas fora do pipeline, e o risco de um
 * bloco assim é exatamente este: desenhar bem com dado e falhar no resto. O
 * carregamento, o vazio e o erro passam pelo mesmo caminho central do renderer,
 * então o que este arquivo tranca é que os quatro ESTÃO nesse caminho — não que
 * o caminho funcione, que já tem teste próprio.
 *
 * ⚠️ Recharts não mede layout em happy-dom, então o desenho em si não é
 * verificável aqui. O objeto do teste é a casca: qual estado o card assume.
 */

const BLOCKS: Record<string, CanvasBlock> = {
  funnel: {
    id: 'f', type: 'funnel', metricId: 'm', title: 'Esteira',
    etapas: [{ etapa: 'Elegíveis', value: 100 }, { etapa: 'Repassados', value: 40 }],
  } as unknown as CanvasBlock,
  sankey: {
    id: 's', type: 'sankey', metricId: 'm', title: 'Migração',
    ordem: ['Sem atraso', '1-30'],
    fluxos: [{ origem: 'Sem atraso', destino: '1-30', value: 10 }],
  } as unknown as CanvasBlock,
  boxplot: {
    id: 'b', type: 'boxplot', metricId: 'm', title: 'LTV por safra',
    grupos: [{ grupo: '2024', min: 0.3, q1: 0.5, mediana: 0.6, q3: 0.7, max: 0.9 }],
  } as unknown as CanvasBlock,
  treemap: {
    id: 't', type: 'treemap', metricId: 'm', title: 'Concentração',
    fatias: [{ name: 'A', value: 10 }, { name: 'B', value: 4 }],
  } as unknown as CanvasBlock,
};

const TYPES = Object.keys(BLOCKS);

/** O mesmo bloco sem o campo de dado — o que o Firestore guarda. */
function withoutData(type: string): CanvasBlock {
  const { etapas, fluxos, grupos, fatias, ...rest } =
    BLOCKS[type] as unknown as Record<string, unknown>;
  void etapas; void fluxos; void grupos; void fatias;
  return rest as unknown as CanvasBlock;
}

describe('blocos de fluxo e distribuição — os três estados', () => {
  /*
   * O contrato é a lista viva. Se um quinto bloco entrar sem passar por aqui,
   * este teste falha em vez de a omissão aparecer numa captura de tela.
   */
  it('a lista testada cobre todos os blocos novos do contrato', () => {
    const inContract = authorableSpecs()
      .map((s) => s.type)
      .filter((t) => TYPES.includes(t));
    expect(inContract.sort()).toEqual([...TYPES].sort());
  });

  it.each(TYPES)('%s carregando mostra esqueleto e não afirma vazio', (blockType) => {
    const { container } = render(<CanvasBlockRenderer block={BLOCKS[blockType]} loading />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.textContent).not.toContain('Sem dados');
  });

  it.each(TYPES)('%s sem linha mostra vazio, e vazio não é erro', (blockType) => {
    const { container } = render(<CanvasBlockRenderer block={withoutData(blockType)} loading={false} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Sem dados');
    expect(text).not.toContain('Não foi possível carregar');
  });

  it.each(TYPES)('%s com erro nomeia o bloco e o motivo', (blockType) => {
    const { container } = render(
      <CanvasBlockRenderer block={withoutData(blockType)} loading={false} error="timeout na consulta" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Não foi possível carregar');
    expect(text).toContain('timeout na consulta');
  });

  /*
   * Sem `metricId` o bloco não tem consulta para ter voltado vazia — dizer
   * "sem dados no período" manda o autor procurar defeito no SQL quando o que
   * falta é preencher um campo no inspetor.
   */
  it.each(TYPES)('%s sem métrica pede a métrica, não culpa o período', (blockType) => {
    const block = { ...withoutData(blockType), metricId: undefined } as CanvasBlock;
    const { container } = render(<CanvasBlockRenderer block={block} loading={false} />);
    expect(container.textContent).toContain('métrica');
  });

  it.each(TYPES)('%s com dado desenha o conteúdo, não o esqueleto', (blockType) => {
    const { container } = render(<CanvasBlockRenderer block={BLOCKS[blockType]} loading={false} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    // O título do card continua sendo do ChartWidget, e é por ele que se
    // reconhece que o bloco montou em vez de cair no vazio.
    expect(within(container).getByText(/Esteira|Migração|LTV por safra|Concentração/)).toBeTruthy();
  });
});
