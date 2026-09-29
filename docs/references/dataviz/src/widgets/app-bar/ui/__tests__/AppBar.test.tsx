/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/shared/ui/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

import { AppBar } from '../AppBar';

describe('AppBar', () => {
  it('mostra o título da página', () => {
    render(<AppBar pageTitle="Visão Geral" />);
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
  });

  it('não oferece mais o dropdown de páginas', () => {
    render(<AppBar pageTitle="Visão Geral" />);
    expect(screen.queryByRole('button', { name: /Visão Geral/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Nova página')).not.toBeInTheDocument();
    expect(screen.queryByText('Importar template')).not.toBeInTheDocument();
  });

  it('não oferece mais o botão de busca', () => {
    render(<AppBar pageTitle="Visão Geral" />);
    expect(screen.queryByRole('button', { name: 'Buscar' })).not.toBeInTheDocument();
  });
});
