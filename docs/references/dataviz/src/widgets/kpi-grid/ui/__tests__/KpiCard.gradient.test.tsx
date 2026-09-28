/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TrendingUp } from 'lucide-react';
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => null }));

import { KpiCard } from '../KpiCard';
import { KpiExpandedModal } from '../KpiExpandedModal';

/**
 * A faixa da sparkline é pintada por um gradiente referenciado como
 * `fill="url(#id)"`, e o id era derivado do RÓTULO do KPI.
 *
 * Rótulo é texto de negócio: "Permuta (m²)", "PDD (Bacen)", "Saldo #3". Um
 * parêntese dentro de `url(#…)` FECHA o token antes da hora, a referência não
 * resolve, e o navegador pinta a área com o fallback — o bloco cinza que
 * aparece no lugar do gradiente da marca. Nenhum teste via isso porque todos
 * usavam rótulos de uma palavra.
 */

const SERIES = [10, 12, 11, 14];

function gradientIds(container: HTMLElement) {
  return [...container.querySelectorAll('linearGradient')].map((n) => n.id);
}

function references(container: HTMLElement) {
  return [...container.querySelectorAll('[fill^="url("]')].map((n) => n.getAttribute('fill')!);
}

describe('KpiCard — referência do gradiente da sparkline', () => {
  it.each([
    ['Permuta (m²)'],
    ['PDD (Bacen)'],
    ['Saldo #3'],
    ['Inadimplência > 90 dias'],
  ])('gera id utilizável em url() para o rótulo %s', (label) => {
    const { container } = render(
      <KpiCard variant="rich" label={label} value="1.030,81" sparklineData={SERIES} />,
    );

    const ids = gradientIds(container);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      // Fora deste conjunto o id ou quebra o `url()` ou não casa como seletor.
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    }
  });

  it('a área aponta para um gradiente que existe no documento', () => {
    const { container } = render(
      <KpiCard variant="rich" label="Permuta (m²)" value="1.030,81" sparklineData={SERIES} />,
    );

    const ids = gradientIds(container);
    const refs = references(container);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const target = /^url\(#(.+)\)$/.exec(ref)?.[1];
      expect(target).toBeDefined();
      expect(ids).toContain(target);
    }
  });

  /*
   * Dois cards com o mesmo rótulo e a mesma posição existem de verdade: a
   * mesma métrica em duas páginas do canvas, ou um KPI repetido lado a lado.
   * Ids iguais fazem o segundo card pintar com a tinta do primeiro, porque
   * `currentColor` resolve no nó onde o gradiente foi DEFINIDO.
   */
  it('dois cards iguais não compartilham o mesmo id', () => {
    const { container } = render(
      <>
        <KpiCard variant="rich" label="Permuta" value="1" sparklineData={SERIES} />
        <KpiCard variant="rich" label="Permuta" value="2" sparklineData={SERIES} />
      </>,
    );

    const ids = gradientIds(container);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

/**
 * O modal de indicador tinha o MESMO id derivado do rótulo — e é ele que
 * aparece quando se clica para expandir o KPI, onde a área ocupa meia tela.
 */
describe('KpiExpandedModal — referência do gradiente', () => {
  function open(label: string) {
    return render(
      <KpiExpandedModal
        isOpen
        onClose={() => {}}
        config={{ label, icon: TrendingUp, value: '1.030,81', format: (v: number) => String(v) }}
        sparklineData={SERIES}
        months={['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']}
      />,
    );
  }

  it('gera id utilizável em url() para rótulo com parêntese', () => {
    open('Permuta (m²)');
    const ids = gradientIds(document.body);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    }
  });

  it('a área aponta para um gradiente que existe no documento', () => {
    open('Permuta (m²)');
    const ids = gradientIds(document.body);
    for (const ref of references(document.body)) {
      expect(ids).toContain(/^url\(#(.+)\)$/.exec(ref)?.[1]);
    }
  });
});
