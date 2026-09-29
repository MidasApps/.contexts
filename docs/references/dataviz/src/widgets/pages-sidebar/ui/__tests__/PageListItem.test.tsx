/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageListItem } from '../PageListItem';

/**
 * Render puro do PageListItem real. O teste da PagesSidebar mocka este
 * componente (decisão legítima, por causa do portal do Radix no menu de
 * ações), então a cobertura de aria-current/aria-label do componente real
 * fica aqui. Não abrimos o DropdownMenu — só verificamos que o trigger
 * existe com o aria-label correto.
 */
function renderItem(active: boolean) {
  return render(
    <PageListItem
      name="Covenants"
      active={active}
      onOpen={vi.fn()}
      onRename={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

describe('PageListItem', () => {
  it('exibe o nome da página', () => {
    renderItem(false);
    expect(screen.getByText('Covenants')).toBeInTheDocument();
  });

  it('marca aria-current quando ativo', () => {
    renderItem(true);
    expect(screen.getByRole('button', { name: 'Covenants' })).toHaveAttribute('aria-current', 'page');
  });

  it('não marca aria-current quando inativo', () => {
    renderItem(false);
    expect(screen.getByRole('button', { name: 'Covenants' })).not.toHaveAttribute('aria-current');
  });

  it('expõe o aria-label do trigger de ações', () => {
    renderItem(false);
    expect(screen.getByRole('button', { name: 'Ações da página Covenants' })).toBeInTheDocument();
  });

  /*
   * O foco precisa ser VISÍVEL e da marca.
   *
   * Nenhum dos dois botões declarava estilo de foco, então sobrava o anel
   * padrão do navegador — um retângulo preto (`outline: auto 0.8px
   * rgb(16,16,16)`) em volta do item. Ele aparece sem ninguém usar teclado:
   * ao fechar o menu de ações, o Radix devolve o foco POR CÓDIGO, e foco
   * programático conta como `:focus-visible`.
   *
   * A correção não é apagar o anel — sem ele quem navega por teclado se perde
   * (WCAG 2.4.7) — é trocá-lo pelo anel do projeto.
   */
  it.each([
    ['Covenants'],
    ['Ações da página Covenants'],
  ])('o botão %s usa o anel de foco do design system, não o preto do navegador', (name) => {
    renderItem(false);
    const button = screen.getByRole('button', { name });
    // `ring-ring` e o token de foco do design system — o mesmo do <Button>.
    expect(button.className).toContain('focus-visible:ring-ring');
    expect(button.className).toContain('focus-visible:outline-none');
  });

  /*
   * Gerar template é ação de admin, e quem decide isso é a PagesSidebar. O
   * componente expressa a permissão pela AUSÊNCIA do callback — sem flag
   * `isAdmin` aqui dentro.
   */
  it('oferece "Salvar como template" quando a ação é passada', async () => {
    const user = userEvent.setup();
    const onSaveAsTemplate = vi.fn();
    render(
      <PageListItem
        name="Covenants"
        active={false}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onSaveAsTemplate={onSaveAsTemplate}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ações da página Covenants' }));
    await user.click(await screen.findByRole('menuitem', { name: /salvar como template/i }));

    expect(onSaveAsTemplate).toHaveBeenCalled();
  });

  it('omite "Salvar como template" para quem não pode criar template', async () => {
    const user = userEvent.setup();
    renderItem(false);

    await user.click(screen.getByRole('button', { name: 'Ações da página Covenants' }));

    expect(await screen.findByRole('menuitem', { name: /renomear/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /salvar como template/i })).not.toBeInTheDocument();
  });
});
