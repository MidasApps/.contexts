/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gauge } from 'lucide-react';
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => null }));

import { KpiExpandedModal } from '../KpiExpandedModal';

/**
 * Expandir um medidor ou uma barra de meta perdia o desenho.
 *
 * O modal monta a própria versão do indicador — rótulo, número grande, o
 * contexto em prosa — e, quando não há série histórica, encerra com "Sem série
 * histórica para este indicador". Medidor e progresso nunca têm série: o que
 * eles mostram é a POSIÇÃO contra um limite, e é justamente o arco (ou a
 * barra) que diz isso de relance.
 *
 * O resultado era uma troca ruim: no card via-se a folga até o covenant; ao
 * ampliar — a tela de examinar com calma — restava lê-la numa frase.
 */

const BASE = {
  label: 'Índice Recebível',
  icon: Gauge,
  value: '8,89x',
  format: (v: number) => `${v}x`,
  context: 'Mínimo contratado: 1,20x. Situação atual: enquadrado (7,4× o mínimo).',
};

function open(extra: Record<string, unknown> = {}) {
  return render(
    <KpiExpandedModal
      isOpen
      onClose={() => {}}
      config={{ ...BASE, ...extra }}
      sparklineData={[]}
      months={[]}
    />,
  );
}

describe('<KpiExpandedModal> — o desenho do indicador', () => {
  it('mostra o visual que o bloco passa', () => {
    open({ visual: <div data-testid="arco-do-medidor" /> });
    expect(screen.getByTestId('arco-do-medidor')).toBeInTheDocument();
  });

  /* Com o desenho na tela, o aviso de "sem série" perde a função: ele existia
     para não deixar a coluna vazia, e a coluna não está mais vazia. */
  it('com visual, não anuncia a falta de série histórica', () => {
    open({ visual: <div data-testid="arco-do-medidor" /> });
    expect(screen.queryByText(/sem série histórica/i)).not.toBeInTheDocument();
  });

  it('sem visual e sem série, o aviso continua', () => {
    open();
    expect(screen.getByText(/sem série histórica/i)).toBeInTheDocument();
  });

  it('o número e o contexto seguem visíveis ao lado do desenho', () => {
    open({ visual: <div data-testid="arco-do-medidor" /> });
    expect(screen.getByText('8,89x')).toBeInTheDocument();
    expect(screen.getByText(/mínimo contratado: 1,20x/i)).toBeInTheDocument();
  });

  /*
   * Série histórica é outra coisa, e quem a tem continua vendo o gráfico: o
   * visual responde "onde estou contra o limite" e a série, "como cheguei
   * aqui". Um não substitui o outro.
   *
   * A busca é no `document`, e não no container do render: o diálogo do Radix
   * monta em portal, fora da árvore devolvida por `render`.
   */
  it('com série histórica, o gráfico não é trocado pelo visual', () => {
    render(
      <KpiExpandedModal
        isOpen
        onClose={() => {}}
        config={{ ...BASE, visual: <div data-testid="arco-do-medidor" /> }}
        sparklineData={[12.06, 8.31, 7.0]}
        months={['2026-05-01', '2026-06-01', '2026-07-01']}
      />,
    );
    expect(screen.getByTestId('arco-do-medidor')).toBeInTheDocument();
    expect(screen.queryByText(/sem série histórica/i)).not.toBeInTheDocument();
  });
});
