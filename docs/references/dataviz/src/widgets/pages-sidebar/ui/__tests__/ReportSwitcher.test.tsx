/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportSwitcher } from '../ReportSwitcher';

/**
 * Render puro do componente real. O teste da PagesSidebar mocka este seletor
 * (o menu do Radix abre em portal, mesmo motivo do PageListItem), então a
 * cobertura do que ele MOSTRA fica aqui — não abrimos o menu.
 */
const REPORTS = [
  { id: 'g1', name: 'Carteira' },
  { id: 'g2', name: 'Covenants mensais' },
];

function renderSwitcher(props: Partial<React.ComponentProps<typeof ReportSwitcher>> = {}) {
  const handlers = {
    onSwitch: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <ReportSwitcher
      reports={REPORTS}
      activeGroupId="g2"
      loading={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ReportSwitcher', () => {
  it('o botão mostra o relatório em foco', () => {
    renderSwitcher();
    expect(screen.getByRole('button', { name: 'Covenants mensais' })).toBeInTheDocument();
  });

  /* Escopo perdido (cliente trocou, relatório excluído) não pode virar botão
     vazio: o primeiro da lista assume até o efeito da coluna corrigir. */
  it('escopo desconhecido cai no primeiro relatório', () => {
    renderSwitcher({ activeGroupId: 'sumiu' });
    expect(screen.getByRole('button', { name: 'Carteira' })).toBeInTheDocument();
  });

  it('enquanto carrega, mostra o esqueleto e nenhum nome', () => {
    renderSwitcher({ loading: true, reports: [] });
    expect(screen.getByTestId('report-switcher-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sem relatório nenhum, o seletor vira o convite para criar o primeiro', () => {
    const { onNew } = renderSwitcher({ reports: [] });
    const invite = screen.getByRole('button', { name: /Criar o primeiro relatório/ });
    fireEvent.click(invite);
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
