/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/shared/ui/filters-button', () => ({
  FiltersButton: () => <div data-testid="filters-button" />,
}));

vi.mock('@/shared/ui/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('../UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

import { AppHeader } from '../AppHeader';
import { useAppStore } from '@/shared/stores/app-store';

describe('AppHeader', () => {
  beforeEach(() => {
    useAppStore.setState({ currentGroupName: '', currentPageTitle: '' });
  });

  it('reúne filtros, tema e a conta', () => {
    render(<AppHeader />);
    expect(screen.getByTestId('filters-button')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  /* O cliente dá escopo aos relatórios que a coluna lista; solto na topbar
     essa relação não se lê. */
  it('o seletor de cliente saiu daqui — vive no topo da coluna', () => {
    render(<AppHeader />);
    expect(screen.queryByTestId('client-switcher')).not.toBeInTheDocument();
  });

  it('mostra a trilha Relatório › Página quando a página se registrou', () => {
    useAppStore.setState({ currentGroupName: 'Carteira', currentPageTitle: 'Visão Geral' });
    render(<AppHeader />);
    expect(screen.getByRole('navigation', { name: 'Trilha de navegação' })).toBeInTheDocument();
    expect(screen.getByText('Carteira')).toBeInTheDocument();
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
  });

  /* Um "Dashboard" genérico de espera piscaria em toda navegação. */
  it('sem página registrada não desenha trilha nenhuma', () => {
    render(<AppHeader />);
    expect(screen.queryByRole('navigation', { name: 'Trilha de navegação' })).not.toBeInTheDocument();
  });

  it('página sem relatório mostra só a página', () => {
    useAppStore.setState({ currentGroupName: '', currentPageTitle: 'Visão Geral' });
    render(<AppHeader />);
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
  });

  /* Recolher a coluna é decisão de tela, não de página: mora no header, igual
     em qualquer rota, e o estado sobrevive à recarga. */
  it('o botão de recolher alterna a coluna e anuncia o estado', () => {
    useAppStore.setState({ isNavCollapsed: false });
    render(<AppHeader />);
    const button = screen.getByRole('button', { name: 'Recolher menu' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(useAppStore.getState().isNavCollapsed).toBe(true);
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('o botão do chat despacha toggle-ai-sidebar', () => {
    const spy = vi.fn();
    window.addEventListener('toggle-ai-sidebar', spy);
    render(<AppHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistente' }));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener('toggle-ai-sidebar', spy);
  });

  it('o menu despacha toggle-nav-sidebar', () => {
    const spy = vi.fn();
    window.addEventListener('toggle-nav-sidebar', spy);
    render(<AppHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener('toggle-nav-sidebar', spy);
  });

  it('não oferece nenhum controle de busca', () => {
    render(<AppHeader />);
    expect(screen.queryByRole('button', { name: /buscar/i })).not.toBeInTheDocument();
    expect(screen.queryByText('⌘ K')).not.toBeInTheDocument();
  });

  /* A trilha é navegação, não cabeçalho: o título grande da página saiu do
     conteúdo, e nada o substituiu como <h1> aqui. */
  it('não mostra título de página como heading', () => {
    useAppStore.setState({ currentGroupName: 'Carteira', currentPageTitle: 'Visão Geral' });
    render(<AppHeader />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
