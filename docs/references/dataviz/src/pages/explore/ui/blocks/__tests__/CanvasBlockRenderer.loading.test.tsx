/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasBlockRenderer } from '../../CanvasBlockRenderer';
import type { CanvasBlock } from '@/shared/config/agents/types';

// Recharts não mede layout em happy-dom; o gráfico real não é o objeto do teste.
vi.mock('../ChartBlock', () => ({ ChartBlock: () => <div>GRAFICO</div> }));
vi.mock('../DonutBlock', () => ({ DonutBlock: () => <div>DONUT</div> }));
vi.mock('../TableBlock', () => ({ TableBlock: () => <div>TABELA</div> }));
vi.mock('../GaugeBlock', () => ({ GaugeBlock: () => <div>GAUGE</div> }));

const kpiCovenant = {
  id: 'k1',
  type: 'kpi',
  metricId: 'covenants.indice_recebivel',
  label: 'Índice Recebível',
  // O template cru traz o valor zerado: é ele que aparecia em vermelho.
  value: '0,00x',
} as unknown as CanvasBlock;

describe('CanvasBlockRenderer — carregando', () => {
  /**
   * O defeito que este teste tranca: enquanto o dado não chegava, o KPI era
   * desenhado com o valor do template (zero). Num covenant de mínimo 1,20x o
   * "0,00x" é pintado de VERMELHO — a tela afirmava que o covenant estava
   * rompido antes de conhecer o valor. Quem só bate o olho lê a informação
   * errada, e ela é grave.
   */
  it('KPI carregando NÃO mostra o valor zerado do template', () => {
    const { container } = render(<CanvasBlockRenderer block={kpiCovenant} loading />);
    expect(container.textContent).not.toContain('0,00');
  });

  it('KPI com dado mostra o valor', () => {
    const withData = { ...kpiCovenant, value: '8,31x' } as CanvasBlock;
    render(<CanvasBlockRenderer block={withData} loading={false} />);
    expect(screen.getByText(/8,31/)).toBeTruthy();
  });

  // "Sem dados para exibir" é uma AFIRMAÇÃO — diz que a consulta voltou vazia.
  // Durante o carregamento ela é falsa: ainda não se sabe.
  it('gráfico carregando não afirma que não há dados', () => {
    const chart = { id: 'c1', type: 'chart', metricId: 'm', title: 'Saldo' } as unknown as CanvasBlock;
    const { container } = render(<CanvasBlockRenderer block={chart} loading />);
    expect(container.textContent).not.toContain('Sem dados para exibir');
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('gráfico com dado renderiza o gráfico, não o esqueleto', () => {
    const chart = { id: 'c1', type: 'chart', metricId: 'm', title: 'Saldo' } as unknown as CanvasBlock;
    const { container } = render(<CanvasBlockRenderer block={chart} loading={false} />);
    expect(container.textContent).toContain('GRAFICO');
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('o título do bloco continua visível durante o carregamento', () => {
    const chart = { id: 'c1', type: 'chart', metricId: 'm', title: 'Saldo Devedor' } as unknown as CanvasBlock;
    render(<CanvasBlockRenderer block={chart} loading />);
    expect(screen.getByText('Saldo Devedor')).toBeTruthy();
  });

  // Texto vem do template, não da métrica: segurá-lo atrás do carregamento
  // esconderia conteúdo que já está pronto.
  it('bloco de texto sem métrica renderiza mesmo carregando', () => {
    const text = { id: 't1', type: 'text', content: 'Nota do relatório' } as unknown as CanvasBlock;
    render(<CanvasBlockRenderer block={text} loading />);
    expect(screen.getByText(/Nota do relatório/)).toBeTruthy();
  });

  it('tabela e donut também não mostram conteúdo cru enquanto carregam', () => {
    const table = { id: 'tb', type: 'table', metricId: 'm' } as unknown as CanvasBlock;
    const donut = { id: 'd', type: 'donut', metricId: 'm', title: 'Total' } as unknown as CanvasBlock;
    const a = render(<CanvasBlockRenderer block={table} loading />);
    expect(a.container.textContent).not.toContain('TABELA');
    const b = render(<CanvasBlockRenderer block={donut} loading />);
    expect(b.container.textContent).not.toContain('DONUT');
  });
});
