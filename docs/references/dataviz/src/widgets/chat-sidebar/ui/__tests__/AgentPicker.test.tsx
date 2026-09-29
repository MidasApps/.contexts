/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * O header do chat dizia só "Assistente" e escondia que existem especialistas.
 * Agora o título É o seletor — com busca, porque a lista cresce.
 */

const setChatAgentIdMock = vi.fn();
const state = vi.hoisted(() => ({ chatAgentId: 'orchestrator' }));

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ ...state, setChatAgentId: setChatAgentIdMock }),
}));

import { AgentPicker } from '../AgentPicker';

function open() {
  render(<AgentPicker />);
  fireEvent.click(screen.getByRole('button', { expanded: false }));
}

describe('AgentPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.chatAgentId = 'orchestrator';
  });

  it('mostra o agente em uso no lugar do título', () => {
    render(<AgentPicker />);
    expect(screen.getByRole('button', { name: /Assistente geral/ })).toBeInTheDocument();
  });

  it('mostra o especialista escolhido, não o padrão', () => {
    state.chatAgentId = 'cashflow';
    render(<AgentPicker />);
    expect(screen.getByRole('button', { name: /Fluxo de caixa/ })).toBeInTheDocument();
  });

  // Id que sumiu entre versões não pode deixar o header em branco.
  it('id desconhecido no store exibe o assistente geral', () => {
    state.chatAgentId = 'agente-que-nao-existe';
    render(<AgentPicker />);
    expect(screen.getByRole('button', { name: /Assistente geral/ })).toBeInTheDocument();
  });

  it('fechado, não lista agente nenhum', () => {
    render(<AgentPicker />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('aberto, lista todos os agentes com a descrição de cada um', () => {
    open();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(9);
    expect(screen.getByText(/Por que aconteceu\?/)).toBeInTheDocument();
  });

  it('marca o agente em uso', () => {
    state.chatAgentId = 'diagnostic';
    open();
    const checked = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveTextContent('Diagnóstico');
  });

  it('escolher um agente grava a escolha e fecha a lista', () => {
    open();
    fireEvent.click(screen.getByText('Macroeconomia'));
    expect(setChatAgentIdMock).toHaveBeenCalledWith('external');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  /* A busca é o motivo de o seletor ser um popover próprio, e não um menu do
     Radix: lá o typeahead disputaria as teclas com o campo. */
  it('a busca filtra a lista', () => {
    open();
    fireEvent.change(screen.getByLabelText('Buscar agente'), { target: { value: 'stress' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Simulação');
  });

  it('busca sem resultado avisa em vez de deixar a lista vazia', () => {
    open();
    fireEvent.change(screen.getByLabelText('Buscar agente'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum agente encontrado')).toBeInTheDocument();
  });

  /* Especialista não tem as tools de autoria — elas são do supervisor. Sem o
     aviso, a conclusão natural é que o assistente esqueceu como montar página. */
  it('com especialista escolhido, avisa que autoria fica no assistente geral', () => {
    state.chatAgentId = 'predictive';
    open();
    expect(screen.getByText(/sem montar ou editar páginas/)).toBeInTheDocument();
  });

  it('com o assistente geral, não há aviso nenhum', () => {
    open();
    expect(screen.queryByText(/sem montar ou editar páginas/)).not.toBeInTheDocument();
  });

  it('Esc fecha a lista', () => {
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
