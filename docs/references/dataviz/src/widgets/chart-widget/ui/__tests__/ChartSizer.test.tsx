/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { ChartSizer } from '../ChartSizer';

/**
 * O desenho não pode empurrar quem o mede.
 *
 * O `ChartSizer` mede o próprio container com `ResizeObserver` e desenha um SVG
 * daquele tamanho. Enquanto o card tem altura fixa isso se sustenta — mas basta
 * a linha do grid passar a ter altura dirigida pelo CONTEÚDO (o grid estica
 * todas as células à altura da maior, então qualquer vizinho que cresça leva
 * as outras junto) para o laço fechar: o SVG vira conteúdo do container, o
 * container cresce pelo padding do card, o observer mede de novo, o SVG cresce.
 *
 * Observado: a página crescia ~40px por quadro, de 2.700px para mais de
 * 55.000px em segundos, e o sintoma aparecia num gráfico que não tinha nada a
 * ver com a mudança — quem mudara era o vizinho de linha.
 *
 * ⚠️ happy-dom não faz layout: não dá para medir o crescimento aqui. O que
 * este teste tranca é a ESTRUTURA que o impede — o desenho fora do fluxo. Um
 * refactor que devolva o SVG ao fluxo reabre o laço, e é isso que precisa
 * falhar cedo.
 */
describe('ChartSizer', () => {
  /**
   * O bloco piscava no modo de EDIÇÃO — encolhia e crescia sem parar — e
   * parava depois de salvar. A causa é um laço de duas medições:
   *
   *   pai sem altura → medimos 0 → entramos no fluxo com altura de reserva →
   *   a reserva dá altura ao pai → medimos > 0 → saímos do fluxo →
   *   a reserva some → pai sem altura de novo → …
   *
   * A medição "> 0" depois da reserva não prova que o pai passou a ter
   * altura: prova que a NOSSA reserva funcionou. Uma vez no fluxo, fica.
   */
  it('não volta a sair do fluxo quando a própria reserva dá altura ao pai', () => {
    const measurements: Array<{ w: number; h: number }> = [];
    let fire: ((r: Array<{ contentRect: { width: number; height: number } }>) => void) | null = null;

    class FakeObserver {
      constructor(cb: (r: Array<{ contentRect: { width: number; height: number } }>) => void) { fire = cb; }
      observe() {}
      disconnect() {}
    }
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;

    try {
      const { container } = render(
        <ChartSizer height="100%" reservedHeight={22}>
          {(w, h) => { measurements.push({ w, h }); return <svg />; }}
        </ChartSizer>,
      );

      // 1) pai sem altura: caímos no fluxo com a reserva
      act(() => fire!([{ contentRect: { width: 200, height: 0 } }]));
      const inner = () => (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
      expect(inner().style.position).not.toBe('absolute');
      expect(measurements.at(-1)).toEqual({ w: 200, h: 22 });

      // 2) a reserva deu altura ao pai — e é AQUI que o laço começava
      act(() => fire!([{ contentRect: { width: 200, height: 22 } }]));
      expect(inner().style.position).not.toBe('absolute');
      expect(measurements.at(-1)).toEqual({ w: 200, h: 22 });
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it('mantém o desenho FORA do fluxo do container medido', () => {
    const { container } = render(
      <ChartSizer height={340}>{() => <svg data-testid="grafico" />}</ChartSizer>,
    );
    const measured = container.firstElementChild as HTMLElement;
    const inner = measured.firstElementChild as HTMLElement;

    expect(measured.style.position).toBe('relative');
    expect(inner.style.position).toBe('absolute');
    expect(inner.style.inset).toBe('0');
  });

  it('reserva a altura pedida no elemento medido', () => {
    const { container } = render(
      <ChartSizer height={340}>{() => <svg />}</ChartSizer>,
    );
    const measured = container.firstElementChild as HTMLElement;
    expect(measured.style.height).toBe('340px');
    expect(measured.style.width).toBe('100%');
  });

  it('altura percentual atravessa como veio — quem manda é o pai', () => {
    const { container } = render(
      <ChartSizer height="100%">{() => <svg />}</ChartSizer>,
    );
    expect((container.firstElementChild as HTMLElement).style.height).toBe('100%');
  });

  /*
   * A razão de o componente existir: o `ResponsiveContainer` do Recharts
   * desenha com {-1, -1} e avisa no console antes da primeira medição. Aqui o
   * filho só é chamado com dimensões, nunca com um placeholder inválido.
   */
  it('só chama o filho com dimensões, nunca com medida inválida', () => {
    const received: Array<[number, number]> = [];
    render(
      <ChartSizer height={340}>
        {(w, h) => { received.push([w, h]); return <svg />; }}
      </ChartSizer>,
    );
    for (const [w, h] of received) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });
});
