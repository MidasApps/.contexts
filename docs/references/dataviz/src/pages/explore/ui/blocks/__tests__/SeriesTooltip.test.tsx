/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { tooltipContent, valueContent } from '../SeriesTooltip';

/**
 * O tooltip é onde o número é LIDO — e era onde o produto mais errava: o
 * separador " : " do Recharts, a unidade adivinhada pela grandeza (acima de
 * mil, moeda), a ordem das faixas espelhada em relação ao desenho.
 */

const PAYLOAD = [
  { dataKey: 'sem_atraso', name: 'Sem atraso', value: 112, color: '#F3A169' },
  { dataKey: 'f1a30', name: '1–30 dias', value: 18, color: '#D4976A' },
  { dataKey: 'f90mais', name: '90+ dias', value: 23, color: '#F27C7C' },
];

function renderContent(Content: (p: unknown) => React.ReactElement | null, props: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<>{Content(props as any)}</>);
}

describe('tooltipContent', () => {
  const basic = tooltipContent({ formatValue: (v) => String(v) });

  it('não desenha nada sem ponto ativo', () => {
    const { container } = renderContent(basic, { active: false, payload: PAYLOAD });
    expect(container.textContent).toBe('');
  });

  it('série única mostra só o número — o nome já está no título do card', () => {
    const { container } = renderContent(basic, {
      active: true, label: 'jun/26', payload: [PAYLOAD[0]],
    });
    expect(container.textContent).toContain('112');
    expect(container.textContent).not.toContain('Sem atraso');
  });

  it('várias séries nomeiam cada uma', () => {
    const { container } = renderContent(basic, { active: true, label: 'jun/26', payload: PAYLOAD });
    const text = container.textContent ?? '';
    for (const p of PAYLOAD) expect(text).toContain(p.name);
  });

  /*
   * O Recharts entrega o empilhado de baixo para cima; a lista saía espelhada
   * em relação às faixas, e o olho tinha de refazer o pareamento a cada leitura.
   */
  it('empilhado lista de cima para baixo, como o desenho', () => {
    const { container } = renderContent(
      tooltipContent({ formatValue: (v) => String(v), topToBottom: true }),
      { active: true, label: 'jun/26', payload: PAYLOAD },
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('90+ dias')).toBeLessThan(text.indexOf('Sem atraso'));
  });

  it('empilhado soma o total — a altura da coluna é a pergunta seguinte', () => {
    const { container } = renderContent(
      tooltipContent({ formatValue: (v) => String(v), showsTotal: true }),
      { active: true, label: 'jun/26', payload: PAYLOAD },
    );
    expect(container.textContent).toContain('Total');
    expect(container.textContent).toContain('153');
  });

  it('sem totaliza não inventa uma soma — somar saldo com taxa não é grandeza', () => {
    const { container } = renderContent(basic, { active: true, label: 'jun/26', payload: PAYLOAD });
    expect(container.textContent).not.toContain('Total');
  });

  /*
   * A série escondida pela legenda sai do payload com valor nulo. Mostrá-la
   * contradiria o clique que acabou de escondê-la.
   */
  it('série escondida não aparece', () => {
    const { container } = renderContent(basic, {
      active: true,
      label: 'jun/26',
      payload: [PAYLOAD[0], { ...PAYLOAD[1], value: null }],
    });
    expect(container.textContent).not.toContain('1–30 dias');
  });

  it('o formatador recebe a CHAVE, para o eixo direito ter unidade própria', () => {
    const { container } = renderContent(
      tooltipContent({
        formatValue: (v, key) => (key === 'f90mais' ? `${v}%` : `R$ ${v}`),
      }),
      { active: true, label: 'jun/26', payload: PAYLOAD },
    );
    const text = container.textContent ?? '';
    expect(text).toContain('23%');
    expect(text).toContain('R$ 112');
  });

  it('o nome já pronto não é re-tratado — "90+ dias" não vira "90+ Dias"', () => {
    const { container } = renderContent(basic, { active: true, payload: [PAYLOAD[2], PAYLOAD[0]] });
    expect(within(container).getByText('90+ dias')).toBeTruthy();
  });
});

describe('valueContent', () => {
  const content = valueContent({
    itemName: (p) => String(p.payload[0].name),
    itemValue: (p) => `R$ ${p.payload[0].value}`,
    details: () => ['16,6% do total'],
  });

  it('nomeia o item e não deixa separador órfão', () => {
    const { container } = renderContent(content, {
      active: true, payload: [{ name: 'Pré-chaves', value: 14 }],
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Pré-chaves');
    expect(text).toContain('R$ 14');
    expect(text).toContain('16,6% do total');
    expect(text).not.toContain(' : ');
    expect(text.trim().startsWith(':')).toBe(false);
  });

  it('sem valor não desenha um card vazio', () => {
    const withoutValue = valueContent({ itemName: () => 'X', itemValue: () => null });
    const { container } = renderContent(withoutValue, { active: true, payload: [{}] });
    expect(container.textContent).toBe('');
  });
});
