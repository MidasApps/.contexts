/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabSelector } from '../TabSelector';

/**
 * O chat deixou de flutuar sobre o relatório e passou a dividir a coluna com
 * o relatório. Este é o controle que troca entre os dois — uma escolha
 * exclusiva, e por isso `aria-pressed` em dois botões e não dois links.
 *
 * A aba se chama "Relatório", e não "Páginas": ela mostra o relatório inteiro
 * — qual é, no dropdown, e as páginas dele logo abaixo. Enquanto o dropdown
 * de relatório ficava ACIMA deste controle, a coluna afirmava que o relatório
 * governava as duas abas, e a lista abaixo dele se chamava outra coisa.
 */
describe('<TabSelector>', () => {
  it('marca a aba corrente', () => {
    render(<TabSelector tab="relatorio" onSwitch={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Relatório' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Assistente' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('troca para o assistente', () => {
    const onSwitch = vi.fn();
    render(<TabSelector tab="relatorio" onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistente' }));
    expect(onSwitch).toHaveBeenCalledWith('assistente');
  });

  it('volta para o relatório', () => {
    const onSwitch = vi.fn();
    render(<TabSelector tab="assistente" onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Relatório' }));
    expect(onSwitch).toHaveBeenCalledWith('relatorio');
  });

  /* Clicar na aba que já está aberta não é troca — e re-renderizar o chat
     apagaria o que estivesse digitado no campo. */
  it('clicar na aba corrente não dispara troca', () => {
    const onSwitch = vi.fn();
    render(<TabSelector tab="assistente" onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistente' }));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('expõe o grupo para leitor de tela', () => {
    render(<TabSelector tab="relatorio" onSwitch={vi.fn()} />);
    expect(screen.getByRole('group', { name: /relatório ou assistente/i })).toBeInTheDocument();
  });

  /*
   * O controle ocupa a coluna, e os dois segmentos a dividem em metades.
   * Encolhido ao tamanho do texto, "Relatório" e "Assistente" têm larguras
   * diferentes, e o alvo de clique de uma aba ficava menor que o da outra sem
   * que nada na tela explicasse a diferença.
   */
  it('ocupa a largura da coluna, em duas metades iguais', () => {
    const { container } = render(<TabSelector tab="relatorio" onSwitch={vi.fn()} />);
    expect(container.firstElementChild).toHaveClass('w-full');
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('flex-1');
    }
  });
});
