/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PositionNote } from '../PositionNote';

/**
 * A nota confessa o que o bloco fez com o período — e a confissão mudou de
 * conteúdo com a ADR-0027.
 *
 * O pin das 45 métricas de posição é
 * `data_base_report = (SELECT MAX(...) WHERE {filter.ate})`: o `MAX` é
 * calculado DENTRO da faixa. Escolher maio devolve o número de maio. Foi
 * exatamente por isso que `positionMonth()` passou a receber o fim do período —
 * antes anunciava jul/26 embaixo do número de junho.
 *
 * O que sobrou incoerente foi a frase: "não acompanha o período" ao lado de um
 * mês que MUDA com o período. As duas metades da mesma linha se desmentiam. O
 * que o bloco de posição de fato não faz é acumular a faixa — ele mostra um
 * retrato do fim dela.
 *
 * O regime `historico` (as 7 métricas sem cláusula de data nenhuma) continua
 * ignorando o filtro inteiro, e ali a frase antiga é verdadeira.
 */
describe('<PositionNote>', () => {
  it('posição nomeia o mês do retrato', () => {
    render(<PositionNote month="2026-06-01" regime="posicao" />);
    expect(screen.getByText(/Posição em jun\/26/)).toBeTruthy();
  });

  it('posição NÃO afirma que ignorou o filtro — o mês dela vem do filtro', () => {
    render(<PositionNote month="2026-06-01" regime="posicao" />);
    expect(screen.queryByText(/não acompanha o período/)).toBeNull();
  });

  it('histórico continua confessando que ignora o período', () => {
    render(<PositionNote month="2026-06-01" regime="historico" />);
    expect(screen.getByText(/Todo o histórico — não acompanha o período/)).toBeTruthy();
  });
});
