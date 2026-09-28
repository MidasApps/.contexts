/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SingleKpiBlock } from '../SingleKpiBlock';
import type { SingleKpiBlock as SingleKpiBlockType } from '@/shared/config/agents/types';

vi.mock('@/shared/config/glossary', () => ({ GLOSSARY: {}, getGlossaryEntry: () => undefined }));

function block(extra: Partial<SingleKpiBlockType> = {}): SingleKpiBlockType {
  return { id: 'k1', type: 'kpi', label: 'Saldo Devedor', ...extra } as SingleKpiBlockType;
}

/**
 * Bloco recém-criado pelo assistente não tem valor: ele declara `metricId` e
 * quem preenche é o pipeline (`useReportData` → `/api/metrics/batch`). Entre a
 * criação e a chegada do dado — e quando a métrica falha — `value` é
 * `undefined`, e `parseRawValue` derrubava a página inteira no ErrorBoundary
 * com "Cannot read properties of undefined (reading 'replace')".
 */
describe('<SingleKpiBlock> sem valor', () => {
  it('renderiza o rótulo e um placeholder em vez de estourar', () => {
    render(<SingleKpiBlock block={block({ metricId: 'covenants.saldo_devedor' })} />);
    expect(screen.getByText('Saldo Devedor')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('não quebra quando há alertThreshold sem valor para comparar', () => {
    expect(() =>
      render(<SingleKpiBlock block={block({ alertThreshold: 5 })} />),
    ).not.toThrow();
  });

  it('com valor, continua mostrando o valor', () => {
    render(<SingleKpiBlock block={block({ value: 'R$ 1.200.000,00' })} />);
    expect(screen.getByText('R$ 1.200.000,00')).toBeInTheDocument();
  });
});

/**
 * O alerta compara NÚMERO com número, e o número vem de uma string formatada em
 * pt-BR — a mesma leitura que o selo comparativo faz, agora num lugar só
 * (`parsePtBrNumber`). Se o ponto de milhar não for removido antes da
 * vírgula, "R$ 1.200.000,00" vira 1,2 e o alerta nunca acende.
 */
describe('<SingleKpiBlock> limiar de alerta', () => {
  const alert = (container: HTMLElement) => container.querySelector('.border-destructive\\/40');

  it('acende acima do limiar, com o valor em moeda', () => {
    const { container } = render(
      <SingleKpiBlock block={block({ value: 'R$ 1.200.000,00', alertThreshold: 1_000_000 })} />,
    );
    expect(alert(container)).toBeTruthy();
  });

  it('fica apagado abaixo do limiar', () => {
    const { container } = render(
      <SingleKpiBlock block={block({ value: 'R$ 900.000,00', alertThreshold: 1_000_000 })} />,
    );
    expect(alert(container)).toBeNull();
  });
});
