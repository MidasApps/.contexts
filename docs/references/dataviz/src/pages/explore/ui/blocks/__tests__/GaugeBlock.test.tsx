/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GaugeBlock } from '../GaugeBlock';
import type { GaugeBlock as GaugeBlockType } from '@/shared/config/agents/types';

/**
 * O gauge de covenant é o bloco que mais mente quando renderiza sem dado: o
 * template nasce com `value: 0` e, num índice de mínimo 1,20x, zero é
 * enquadramento ROMPIDO — pintado de vermelho. Nada disso é sabido antes da
 * consulta voltar.
 */
const receivableIndex: GaugeBlockType = {
  id: 'gauge-indice-recebivel',
  type: 'gauge',
  label: 'Índice Recebível',
  value: 0,
  threshold: 1.2,
  suffix: 'x',
} as GaugeBlockType;

describe('GaugeBlock', () => {
  it('carregando não mostra o valor zerado do template', () => {
    const { container } = render(<GaugeBlock block={receivableIndex} loading />);
    expect(container.textContent).not.toContain('0,00');
  });

  it('carregando não emite veredito de enquadramento (sem cor de status)', () => {
    const { container } = render(<GaugeBlock block={receivableIndex} loading />);
    const card = container.querySelector('[aria-busy="true"]');
    expect(card).toBeTruthy();
    expect(card!.className).not.toMatch(/emerald|amber|destructive/);
  });

  // Rótulo e mínimo vêm do template — são verdade antes da consulta e não
  // devem virar barra cinza.
  it('carregando mantém o rótulo e o mínimo do covenant', () => {
    render(<GaugeBlock block={receivableIndex} loading />);
    expect(screen.getByText('Índice Recebível')).toBeTruthy();
    expect(screen.getByText(/Mín\. 1,20/)).toBeTruthy();
  });

  it('com dado abaixo do mínimo marca rompimento em vermelho', () => {
    const { container } = render(
      <GaugeBlock block={{ ...receivableIndex, value: 0.8 }} loading={false} />,
    );
    expect(container.textContent).toContain('0,80');
    expect(container.innerHTML).toMatch(/text-destructive/);
  });

  /*
   * O enquadrado NAO ganha cor propria.
   *
   * Numa pagina de covenants quase tudo esta enquadrado, e pintar o normal de
   * verde deixava a tela inteira verde — a cor parava de dizer "esta bem" e
   * passava a dizer "isto e um card". E o mesmo argumento que ja tirou a cor
   * da BORDA (ver `block-shell.tsx`), agora aplicado ao numero e a barra:
   * atencao e ruptura seguem coloridos, porque sao a excecao que precisa
   * saltar.
   */
  it('com dado acima do mínimo marca enquadrado sem pintar de verde', () => {
    const { container } = render(
      <GaugeBlock block={{ ...receivableIndex, value: 8.31 }} loading={false} />,
    );
    expect(container.textContent).toContain('8,31');
    expect(container.innerHTML).not.toMatch(/text-success|fill-success/);
  });

  it('o enquadrado usa a tinta da marca, nao uma cor de estado', () => {
    const { container } = render(
      <GaugeBlock block={{ ...receivableIndex, value: 8.31 }} loading={false} />,
    );
    expect(container.innerHTML).toMatch(/text-foreground/);
    expect(container.innerHTML).toMatch(/fill-primary/);
  });

  /* A excecao continua gritando — e o que sobra de sinal depois da limpeza. */
  it('ruptura continua vermelha', () => {
    const { container } = render(
      <GaugeBlock block={{ ...receivableIndex, value: 0.8 }} loading={false} />,
    );
    expect(container.innerHTML).toMatch(/text-destructive/);
  });

  // O card se pinta sozinho: no tema claro `bg-muted` tem a mesma
  // luminosidade da superfície da página e o bloco sumia dentro do fundo,
  // enquanto os cards vizinhos apareciam brancos.
  it('usa a mesma superfície de card dos blocos vizinhos', () => {
    const { container } = render(<GaugeBlock block={receivableIndex} loading={false} />);
    expect(container.firstElementChild!.className).toContain('bg-popover');
  });
});
