/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WidthRuler } from '../WidthRuler';
import type { WidthRange } from '@/features/report-authoring/schema/block-specs';

const FREE: WidthRange = { min: 1, recommended: 2, max: 6 };
const CHART: WidthRange = { min: 3, recommended: 3, max: 6 };

function mount(props: Partial<Parameters<typeof WidthRuler>[0]> = {}) {
  const onChoose = vi.fn();
  render(
    <WidthRuler
      width={2}
      range={FREE}
      widthRationale="O valor a 30px pede ~240px."
      onChoose={onChoose}
      {...props}
    />,
  );
  return { onChoose, ruler: screen.getByRole('slider') };
}

describe('WidthRuler', () => {
  it('anuncia a largura corrente e a faixa do contrato', () => {
    const { ruler } = mount({ width: 4, range: CHART });
    expect(ruler).toHaveAttribute('aria-valuenow', '4');
    expect(ruler).toHaveAttribute('aria-valuemin', '3');
    expect(ruler).toHaveAttribute('aria-valuemax', '6');
    expect(ruler).toHaveAttribute('aria-valuetext', '4 de 6 colunas');
  });

  it('cresce e encolhe uma coluna por seta', async () => {
    const user = userEvent.setup();
    const { onChoose, ruler } = mount({ width: 3 });
    ruler.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChoose).toHaveBeenCalledWith(4);
    await user.keyboard('{ArrowLeft}');
    expect(onChoose).toHaveBeenLastCalledWith(2);
  });

  it('Home e End vão aos limites da faixa, não a 1 e 6', async () => {
    const user = userEvent.setup();
    const { onChoose, ruler } = mount({ width: 4, range: CHART });
    ruler.focus();
    await user.keyboard('{Home}');
    expect(onChoose).toHaveBeenCalledWith(3);
    await user.keyboard('{End}');
    expect(onChoose).toHaveBeenLastCalledWith(6);
  });

  it('não emite nada ao tentar passar do mínimo do bloco', async () => {
    const user = userEvent.setup();
    const { onChoose, ruler } = mount({ width: 3, range: CHART });
    ruler.focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('diz a faixa que o bloco aceita, e por que ela é essa', () => {
    const { ruler } = mount({ width: 3, range: CHART });
    expect(ruler.getAttribute('title')).toContain('aceita de 3 a 6');
    expect(ruler.getAttribute('title')).toContain('O valor a 30px pede ~240px.');
  });

  it('desabilitada sai da ordem de tabulação e ignora o teclado', async () => {
    const user = userEvent.setup();
    const { onChoose, ruler } = mount({ disabled: true });
    expect(ruler).toHaveAttribute('tabindex', '-1');
    expect(ruler).toHaveAttribute('aria-disabled', 'true');
    ruler.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChoose).not.toHaveBeenCalled();
  });

  /*
   * O que a régua responde ANTES do clique.
   *
   * Sem isto ela só tinha o estado final: o cursor atravessava seis segmentos
   * de 8px sem nada mudar, e a faixa do contrato era uma opacidade que lê como
   * "desligado" — que é justamente o estado de quem está dentro da faixa e não
   * foi escolhido.
   */
  describe('mira', () => {
    /** happy-dom não faz layout: sem rect, toda coluna cairia no mínimo. */
    function withTrack(ruler: HTMLElement, width = 60) {
      ruler.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: width, bottom: 24,
        width, height: 24, toJSON: () => ({}),
      }) as DOMRect;
    }

    const segment = (n: number) => document.querySelector(`[data-coluna="${n}"]`);

    it('fora da faixa o segmento é batente, não segmento apagado', () => {
      mount({ width: 4, range: CHART });
      // 1 e 2 estão abaixo do mínimo do gráfico: viram toco de 4px.
      for (const n of [1, 2]) {
        expect(segment(n)).toHaveAttribute('data-estado', 'indisponivel');
        expect(segment(n)?.className).toContain('h-1');
      }
      expect(segment(3)).toHaveAttribute('data-estado', 'aceso');
      expect(segment(3)?.className).toContain('h-3');
    });

    it('mirar à frente acende o que ganharia, sem consumar a largura', () => {
      const { onChoose, ruler } = mount({ width: 2, range: FREE });
      withTrack(ruler);
      fireEvent.pointerMove(ruler, { clientX: 35 }); // 4º segmento de 10px

      expect(segment(2)).toHaveAttribute('data-estado', 'aceso');
      expect(segment(3)).toHaveAttribute('data-estado', 'ganharia');
      expect(segment(4)).toHaveAttribute('data-estado', 'ganharia');
      expect(segment(5)).toHaveAttribute('data-estado', 'apagado');
      // Mirar não escolhe: quem escolhe é o clique.
      expect(onChoose).not.toHaveBeenCalled();
    });

    it('mirar atrás mostra o que perderia', () => {
      const { ruler } = mount({ width: 5, range: FREE });
      withTrack(ruler);
      fireEvent.pointerMove(ruler, { clientX: 25 }); // 3º segmento

      expect(segment(3)).toHaveAttribute('data-estado', 'aceso');
      expect(segment(4)).toHaveAttribute('data-estado', 'perderia');
      expect(segment(5)).toHaveAttribute('data-estado', 'perderia');
    });

    it('a etiqueta traz o número mirado e a faixa do bloco', () => {
      const { ruler } = mount({ width: 4, range: CHART });
      withTrack(ruler);
      expect(screen.queryByText(/mín/)).not.toBeInTheDocument();

      fireEvent.pointerMove(ruler, { clientX: 55 }); // 6º segmento
      expect(screen.getByText(/6\/6/)).toBeInTheDocument();
      expect(screen.getByText('mín 3 · máx 6')).toBeInTheDocument();

      fireEvent.pointerLeave(ruler);
      expect(screen.queryByText(/mín/)).not.toBeInTheDocument();
    });

    it('sem restrição de tipo, a etiqueta não repete 1 e 6', () => {
      const { ruler } = mount({ width: 2, range: FREE });
      withTrack(ruler);
      fireEvent.pointerMove(ruler, { clientX: 15 });
      expect(screen.getByText(/2\/6/)).toBeInTheDocument();
      expect(screen.queryByText(/mín/)).not.toBeInTheDocument();
    });

    /*
     * A etiqueta sai pelo lado oposto ao card. Julgar largura é olhar para o
     * bloco, e a etiqueta pousada no canto dele cobria a variação que mora ali.
     */
    it.each([
      ['acima', 'bottom-full'],
      ['abaixo', 'top-full'],
    ] as const)('com o trilho %s, a etiqueta sai para o lado oposto ao card', (side, anchor) => {
      const { ruler } = mount({ width: 4, range: CHART, side });
      withTrack(ruler);
      fireEvent.pointerMove(ruler, { clientX: 35 });
      expect(screen.getByText(/mín/).parentElement?.className).toContain(anchor);
    });

    it('quem chega pelo teclado também vê a etiqueta', () => {
      const { ruler } = mount({ width: 4, range: CHART });
      fireEvent.focus(ruler);
      expect(screen.getByText('mín 3 · máx 6')).toBeInTheDocument();
      fireEvent.blur(ruler);
      expect(screen.queryByText(/mín/)).not.toBeInTheDocument();
    });
  });
});
