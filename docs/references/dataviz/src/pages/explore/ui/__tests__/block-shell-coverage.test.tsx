/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CanvasBlockRenderer } from '../CanvasBlockRenderer';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { makeEmptyBlock, PALETTE_TYPES, type PaletteBlockType } from '@/shared/config/agents/template-blocks';

/**
 * O gancho da junta com o trilho — verificado tipo a tipo.
 *
 * O trilho de controles encosta no topo do bloco e precisa que a casca perca o
 * arredondamento naquele lado, senão o card curva para dentro embaixo de uma
 * peça de canto reto e sobra um degrau de 16px em cada ponta. Quem apaga o raio
 * é um seletor de fora (`[&_[data-casca]]:rounded-t-none`, no `CanvasPanel`), e
 * ele só alcança quem carrega o atributo.
 *
 * Este teste existe porque a casca é desenhada em CINCO componentes
 * (`block-shell`, `ChartWidget`, `KpiCard`, `BlockError`, `GhostBlock`), e a
 * primeira leva marcou só três. O defeito é silencioso: nada quebra, nada
 * avisa — o canto simplesmente fica torto no tipo que ficou de fora, e só
 * aparece quando alguém passa o mouse naquele bloco específico.
 */

/**
 * Tipos que legitimamente não desenham casca — e por quê.
 *
 * Lista curta e explícita de propósito: se um tipo NOVO cair aqui, é decisão
 * de quem o criou, não descuido herdado.
 */
const WITHOUT_SHELL = [
  // Texto é corrido na página, sem moldura própria.
  'text',
  // A tabela desenha cabeçalho e linhas, não um card.
  'table',
] as const satisfies readonly PaletteBlockType[];

describe('casca do bloco — o gancho `data-casca`', () => {
  // O `as` alarga a tupla literal para o `includes` aceitar qualquer tipo da
  // paleta — sem ele o TS restringe o argumento aos dois nomes da lista.
  const withoutShell = WITHOUT_SHELL as readonly PaletteBlockType[];
  const withShell = PALETTE_TYPES.filter((t) => !withoutShell.includes(t));

  it.each(withShell)('%s expõe `data-casca` para o trilho apagar o raio da junta', (type) => {
    const { container } = render(<CanvasBlockRenderer block={makeEmptyBlock(type)} />);
    expect(container.querySelector('[data-casca]')).not.toBeNull();
  });

  it('bloco em erro também expõe o gancho — o fantasma é card como qualquer outro', () => {
    const { container } = render(
      <CanvasBlockRenderer block={makeEmptyBlock('kpi')} error="Não foi possível carregar" />,
    );
    expect(container.querySelector('[data-casca]')).not.toBeNull();
  });

  /*
   * Os dois sem casca precisam de DADO para serem testados.
   *
   * Vazio e erro sempre desenham card — é o fantasma, que existe justamente
   * para os dois estados terem forma. Uma tabela recém-criada, sem métrica,
   * renderiza o fantasma e portanto expõe o gancho; só com linhas ela mostra a
   * própria forma, que é grade, não moldura.
   */
  const WITH_DATA: Record<(typeof WITHOUT_SHELL)[number], CanvasBlock> = {
    text: makeEmptyBlock('text'),
    table: {
      ...makeEmptyBlock('table'),
      metricId: 'metrica_qualquer',
      rows: [{ coluna: 'valor' }],
    } as CanvasBlock,
  };

  it.each(WITHOUT_SHELL)('%s com conteúdo não desenha casca, e isso é declarado', (type) => {
    const { container } = render(<CanvasBlockRenderer block={WITH_DATA[type]} />);
    expect(container.querySelector('[data-casca]')).toBeNull();
  });
});
