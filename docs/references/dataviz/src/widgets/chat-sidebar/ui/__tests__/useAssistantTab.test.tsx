/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useAppStore } from '@/shared/stores/app-store';
import { useAssistantTab } from '../useAssistantTab';

/**
 * Herdeiro do painel flutuante: quando o chat deixou de sobrepor o relatório
 * e virou uma aba da coluna, estas duas regras vieram junto — e os testes que
 * as cobriam em `ChatSidebar.test.tsx` vieram com elas.
 */

function mockDesktop(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches, media: '', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList);
}

function Probe() {
  useAssistantTab();
  return null;
}

const fireShortcut = () => act(() => {
  window.dispatchEvent(new CustomEvent('toggle-ai-sidebar'));
});

describe('useAssistantTab — atalho', () => {
  beforeEach(() => {
    useAppStore.setState({ chatOpen: false, editingReport: false });
  });

  it('o atalho abre a aba do assistente no desktop', () => {
    mockDesktop(true);
    render(<Probe />);
    fireShortcut();
    expect(useAppStore.getState().chatOpen).toBe(true);
  });

  it('o atalho fecha quando já estava aberta', () => {
    mockDesktop(true);
    useAppStore.setState({ chatOpen: true });
    render(<Probe />);
    fireShortcut();
    expect(useAppStore.getState().chatOpen).toBe(false);
  });

  /* Abaixo de 1024px quem responde é a gaveta de chat do DashboardLayout —
     os dois reagindo ao mesmo evento brigariam pelo estado. */
  it('no mobile o atalho não mexe na coluna', () => {
    mockDesktop(false);
    render(<Probe />);
    fireShortcut();
    expect(useAppStore.getState().chatOpen).toBe(false);
  });

  it('para de ouvir depois de desmontar', () => {
    mockDesktop(true);
    const { unmount } = render(<Probe />);
    unmount();
    fireShortcut();
    expect(useAppStore.getState().chatOpen).toBe(false);
  });
});

describe('useAssistantTab — edição de relatório', () => {
  beforeEach(() => {
    mockDesktop(true);
    useAppStore.setState({ chatOpen: false, editingReport: false });
  });

  it('entrar na edição abre o assistente', () => {
    const { rerender } = render(<Probe />);
    act(() => { useAppStore.setState({ editingReport: true }); });
    rerender(<Probe />);
    expect(useAppStore.getState().chatOpen).toBe(true);
  });

  it('sair da edição devolve o estado anterior', () => {
    const { rerender } = render(<Probe />);
    act(() => { useAppStore.setState({ editingReport: true }); });
    rerender(<Probe />);
    act(() => { useAppStore.setState({ editingReport: false }); });
    rerender(<Probe />);
    expect(useAppStore.getState().chatOpen).toBe(false);
  });

  /* Quem já estava com o assistente aberto continua com ele depois de editar
     — restaurar "fechado" ali seria desfazer uma escolha que ninguém fez. */
  it('quem já estava com o assistente aberto segue com ele', () => {
    useAppStore.setState({ chatOpen: true });
    const { rerender } = render(<Probe />);
    act(() => { useAppStore.setState({ editingReport: true }); });
    rerender(<Probe />);
    act(() => { useAppStore.setState({ editingReport: false }); });
    rerender(<Probe />);
    expect(useAppStore.getState().chatOpen).toBe(true);
  });

  /* Fechar na mão durante a edição é escolha explícita: a restauração não
     pode reabrir o que a pessoa acabou de fechar. */
  it('fechar na mão durante a edição vence a restauração', () => {
    const { rerender } = render(<Probe />);
    act(() => { useAppStore.setState({ editingReport: true }); });
    rerender(<Probe />);
    act(() => { useAppStore.setState({ chatOpen: false }); });
    rerender(<Probe />);
    act(() => { useAppStore.setState({ editingReport: false }); });
    rerender(<Probe />);
    expect(useAppStore.getState().chatOpen).toBe(false);
  });
});
