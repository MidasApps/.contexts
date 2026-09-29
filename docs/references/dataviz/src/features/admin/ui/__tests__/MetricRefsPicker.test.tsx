/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const METRICS = [
  { id: 'saldo', label: 'Saldo devedor', status: 'active', requires: ['c.contratos.saldo'] },
  { id: 'atraso', label: 'Valor em atraso', status: 'active', requires: ['c.parcelas.valor'] },
  { id: 'velha', label: 'Descontinuada', status: 'deprecated', requires: ['c.contratos.x'] },
];

vi.mock('@/features/admin/model/useAdminMetrics', () => ({
  useAdminMetrics: () => ({ metrics: METRICS, loading: false }),
}));

import { MetricRefsPicker } from '../MetricRefsPicker';

describe('MetricRefsPicker', () => {
  it('lista só métricas ativas cujas entities estão no produto', () => {
    render(<MetricRefsPicker value={[]} onChange={() => {}} availableEntityIds={['contratos']} />);
    expect(screen.getByText('saldo')).toBeTruthy();
    expect(screen.queryByText('atraso')).toBeNull();
    expect(screen.queryByText('velha')).toBeNull();
  });

  it('sem entity selecionada, pede uma entity em vez de listar', () => {
    render(<MetricRefsPicker value={[]} onChange={() => {}} availableEntityIds={[]} />);
    expect(screen.getByText(/Selecione ao menos uma entity/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('marcar adiciona à seleção e desmarcar remove', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const entities = ['contratos', 'parcelas'];
    const { rerender } = render(
      <MetricRefsPicker value={['saldo']} onChange={onChange} availableEntityIds={entities} />,
    );

    await user.click(screen.getByRole('checkbox', { name: /atraso/ }));
    expect(onChange).toHaveBeenLastCalledWith(['saldo', 'atraso']);

    rerender(<MetricRefsPicker value={['saldo', 'atraso']} onChange={onChange} availableEntityIds={entities} />);
    await user.click(screen.getByRole('checkbox', { name: /saldo/ }));
    expect(onChange).toHaveBeenLastCalledWith(['atraso']);
  });

  it('a lista acompanha a troca de entities do produto', () => {
    const { rerender } = render(
      <MetricRefsPicker value={[]} onChange={() => {}} availableEntityIds={['contratos']} />,
    );
    expect(screen.queryByText('atraso')).toBeNull();

    rerender(<MetricRefsPicker value={[]} onChange={() => {}} availableEntityIds={['parcelas']} />);
    expect(screen.getByText('atraso')).toBeTruthy();
    expect(screen.queryByText('saldo')).toBeNull();
  });
});
