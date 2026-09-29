/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../dialog';

/**
 * O teto de altura do diálogo.
 *
 * `DialogContent` é centrado com `translate-y(-50%)`, então conteúdo que passa
 * da tela sai pelas DUAS pontas: o título e o ✕ somem por cima, os botões por
 * baixo — e sem `overflow` não há rolagem que os alcance. Medido no diálogo de
 * salvar template: 676px de conteúdo numa viewport de 662px, `max-height: none`,
 * `overflow-y: visible`, cortado em cima e embaixo.
 *
 * ⚠️ A asserção é sobre CLASSE, e não sobre altura computada, porque o
 * happy-dom não processa o CSS do Tailwind — `getComputedStyle` devolveria
 * vazio para qualquer utilitária. O que este teste protege é a existência do
 * teto; que ele funciona foi medido no navegador.
 */
function open(className?: string) {
  render(
    <Dialog open>
      <DialogContent className={className}>
        <DialogHeader><DialogTitle>Um título</DialogTitle></DialogHeader>
        <p>corpo</p>
        <DialogFooter><button type="button">OK</button></DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  return document.querySelector('[data-slot="dialog-content"]')!;
}

describe('DialogContent — teto de altura', () => {
  it('limita a altura à tela', () => {
    expect(open().className).toMatch(/max-h-/);
  });

  it('deixa rolar o que não couber', () => {
    expect(open().className).toMatch(/overflow-y-(auto|scroll)/);
  });

  /*
   * Onze dos diálogos do app já traziam o próprio `max-h`. O teto da base não
   * pode atropelá-los: as duas classes convivem e vence a menor.
   */
  it('não descarta o teto que o diálogo declarar por conta própria', () => {
    const el = open('max-h-[300px]');
    expect(el.className).toContain('max-h-[300px]');
  });

  it('segue entregando título e rodapé', () => {
    open();
    expect(screen.getByText('Um título')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});
