/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { CanvasBlockRenderer } from '../../CanvasBlockRenderer';
import { HEIGHT, blockFamilyOf } from '../block-shell';
import { widthOf } from '@/features/report-authoring/schema/block-specs';
import { createAddGaugeBlockTool } from '@/features/report-authoring/tools/add-block';

/**
 * A escala vertical dos blocos.
 *
 * A linha do relatório é `grid grid-cols-6 gap-4`, e grid estica todos os itens
 * até a altura do mais alto. Altura de bloco, portanto, não é decisão local: um
 * bloco mais alto que o vizinho não fica mais alto — ele obriga o vizinho a
 * crescer e a exibir um vazio embaixo do conteúdo.
 *
 * Foi o que o gauge com arco provocou. O gauge antigo media ~110px, a mesma
 * altura de um KPI, e os dois dividiam linha sem sobra; o arco empilhado sobre
 * o valor levou o bloco a ~200px e passou a esticar todo KPI ao lado. Estes
 * testes fixam os degraus para que isso não volte por acidente.
 */
describe('escala vertical', () => {
  it('tem três degraus, e cada um é maior que o anterior', () => {
    expect(HEIGHT.indicador).toBeLessThan(HEIGHT.conjunto);
    expect(HEIGHT.conjunto).toBeLessThan(HEIGHT.grafico);
  });

  it('os blocos de UM NÚMERO compartilham o mesmo degrau', () => {
    for (const type of ['kpi', 'gauge', 'progress', 'comparison']) {
      expect(blockFamilyOf({ type }), type).toBe('indicador');
    }
  });

  it('conjunto e composição compartilham o degrau do meio', () => {
    for (const type of ['targets', 'sparkrows', 'donut', 'heatmap']) {
      expect(blockFamilyOf({ type }), type).toBe('conjunto');
    }
  });

  it('os cartesianos compartilham o degrau da plotagem', () => {
    for (const type of ['chart', 'scatter']) {
      expect(blockFamilyOf({ type }), type).toBe('grafico');
    }
  });

  /**
   * As variantes compactas existem para ocupar MENOS altura. Um piso as
   * devolveria ao tamanho de que vieram fugindo — a barra de linha única mede
   * ~70px justamente para não gastar os 240px da rosca.
   */
  it('as variantes de faixa não recebem piso', () => {
    expect(blockFamilyOf({ type: 'donut', display: 'bar' })).toBeUndefined();
    expect(blockFamilyOf({ type: 'targets', display: 'list' })).toBeUndefined();
    // …mas as variantes cheias recebem.
    expect(blockFamilyOf({ type: 'donut', display: 'donut' })).toBe('conjunto');
    expect(blockFamilyOf({ type: 'targets', display: 'bullet' })).toBe('conjunto');
  });

  it('texto e tabela não recebem piso — crescem com o conteúdo', () => {
    expect(blockFamilyOf({ type: 'text' })).toBeUndefined();
    expect(blockFamilyOf({ type: 'table' })).toBeUndefined();
  });
});

describe('o renderizador aplica o piso da família', () => {
  const renderBlock = (block: CanvasBlock) => render(<CanvasBlockRenderer block={block} />).container;

  it('gauge e progress saem com o MESMO piso — eles dividem linha', () => {
    const gauge = renderBlock({
      id: 'g', type: 'gauge', label: 'Cobertura', value: 1.38, threshold: 1.2, colSpan: 2,
    });
    const progress = renderBlock({
      id: 'p', type: 'progress', label: 'Repasses', value: 39, target: 50, colSpan: 2,
    });

    const floorOf = (c: HTMLElement) =>
      (c.firstElementChild as HTMLElement | null)?.style.minHeight;

    expect(floorOf(gauge)).toBe(`${HEIGHT.indicador}px`);
    expect(floorOf(progress)).toBe(floorOf(gauge));
  });

  it('o donut em barra não é esticado até o degrau da rosca', () => {
    const bar = renderBlock({
      id: 'd', type: 'donut', display: 'bar', slices: [{ name: 'a', value: 1 }], colSpan: 3,
    });
    expect((bar.firstElementChild as HTMLElement).style.minHeight).toBe('');
  });
});

/**
 * O gauge em arco.
 *
 * O arco não foi descartado por ser feio — foi por não caber em 2/6 com 172px.
 * Como variante declarada, o contrato lhe dá a largura de que precisa (3/6) e o
 * degrau de altura de uma composição, onde ele de fato divide linha.
 */
describe('gauge em arco', () => {
  it('o contrato exige 3 colunas para o arco, e 2 bastam para a faixa', () => {
    expect(widthOf('gauge', {}).min).toBe(2);
    expect(widthOf('gauge', { display: 'arc' }).min).toBe(3);
  });

  it('o arco muda de família — não divide linha com KPI', () => {
    expect(blockFamilyOf({ type: 'gauge' })).toBe('indicador');
    expect(blockFamilyOf({ type: 'gauge', display: 'arc' })).toBe('conjunto');
  });

  it('a tool ajusta a largura pedida e explica, em vez de espremer o arco', async () => {
    const tool = createAddGaugeBlockTool({ catalog: ['covenants.indice_recebivel'] }) as unknown as {
      execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
    const r = await tool.execute({
      metricId: 'covenants.indice_recebivel', label: 'L', threshold: 1.2,
      display: 'arc', colSpan: 2,
    });
    expect((r.block as { colSpan: number }).colSpan).toBe(3);
    expect(r.aviso).toMatch(/Largura ajustada de 2 para 3/);
  });
});

/**
 * Affordance uniforme na linha.
 *
 * `expandable` não chegava a `targets`, `progress`, `comparison` e
 * `sparkrows`. O efeito não era visual, era de comportamento: numa linha com
 * um `progress` ao lado de um `kpi`, o mouse passava nos dois e só um
 * respondia — sem hover, sem foco por teclado, sem modal. Um bloco que não
 * reage parece desabilitado.
 */
describe('todo bloco de indicador responde ao mouse e ao teclado', () => {
  const cases: CanvasBlock[] = [
    { id: 'a', type: 'kpi', label: 'KPI', value: '10' },
    { id: 'b', type: 'gauge', label: 'Gauge', value: 1.4, threshold: 1.2 },
    { id: 'c', type: 'progress', label: 'Progresso', value: 40, target: 100 },
    { id: 'd', type: 'comparison', label: 'Comparação', current: 5, previous: 6 },
    {
      id: 'e', type: 'targets',
      items: [{ label: 'Cobertura', value: 1.4, target: 1.2 }],
    },
    {
      id: 'f', type: 'sparkrows',
      series: [{ name: 'saldo', points: [1, 2, 3] }],
    },
  ];

  for (const block of cases) {
    it(`${block.type} vira alvo focável quando expandível`, () => {
      const { container } = render(<CanvasBlockRenderer block={block} expandable />);
      const target = container.querySelector('[role="button"][tabindex="0"], button[aria-label^="Ver detalhes"]');
      expect(target, `${block.type} não expõe alvo interativo`).not.toBeNull();
    });

    it(`${block.type} NÃO fica interativo sem expandable`, () => {
      const { container } = render(<CanvasBlockRenderer block={block} />);
      expect(container.querySelector('[role="button"][tabindex="0"]')).toBeNull();
    });
  }
});

/**
 * Vazio e erro sobre o fantasma do próprio bloco.
 *
 * Cada tipo tinha o seu estado vazio: travessão no KPI, caixa de 180px no
 * donut, de 340px no gráfico, nenhum no gauge. Agora os dois estados são
 * decididos no renderizador e têm a mesma forma — o bloco desenhado com dado
 * de mentira, esmaecido, com a mensagem por cima.
 */
describe('vazio e erro', () => {
  const withoutData: CanvasBlock = {
    id: 'v', type: 'donut', metricId: 'm', title: 'Composição', slices: [],
  };
  const withData: CanvasBlock = {
    id: 'c', type: 'donut', metricId: 'm', title: 'Composição',
    slices: [{ name: 'A', value: 1 }],
  };

  it('bloco sem dado desenha o vazio, não o conteúdo', () => {
    const { container } = render(<CanvasBlockRenderer block={withoutData} />);
    expect(within(container).getByText(/Sem dados no período/)).toBeTruthy();
  });

  it('bloco com dado não desenha estado nenhum', () => {
    const { container } = render(<CanvasBlockRenderer block={withData} />);
    expect(within(container).queryByText(/Sem dados no período/)).toBeNull();
    expect(within(container).queryByText(/Não foi possível carregar/)).toBeNull();
  });

  /** Vazio NÃO é erro: pintá-lo de vermelho ensina a temer uma consulta sem linhas. */
  it('o vazio é neutro; só o erro é vermelho', () => {
    // Consulta pela string da classe, e não por seletor CSS: a `/` das classes
    // do Tailwind exige escape e vira fonte de falso negativo no teste.
    const hasErrorRing = (c: HTMLElement) =>
      [...c.querySelectorAll('*')].some((e) => String(e.className).includes('ring-destructive'));

    const { container: empty } = render(<CanvasBlockRenderer block={withoutData} />);
    expect(hasErrorRing(empty)).toBe(false);

    const { container: error } = render(
      <CanvasBlockRenderer block={withData} error="Métrica inválida" />,
    );
    expect(hasErrorRing(error)).toBe(true);
  });

  it('o erro diz QUAL foi, não só que houve', () => {
    const { container } = render(
      <CanvasBlockRenderer block={withData} error='Métrica "covenants.x" inválida' />,
    );
    expect(within(container).getByText(/covenants\.x/)).toBeTruthy();
  });

  /**
   * O fantasma é decoração: número de mentira legível passaria por dado, e
   * leitor de tela e teclado nunca podem alcançá-lo.
   */
  it('o fantasma é escondido de leitor de tela e do mouse', () => {
    const { container } = render(<CanvasBlockRenderer block={withoutData} />);
    const ghost = container.querySelector('[aria-hidden="true"].pointer-events-none');
    expect(ghost).not.toBeNull();
    expect(ghost!.className).toMatch(/opacity-\[0\.13\]/);
  });

  /** Carregar não é falhar — o esqueleto anuncia movimento, o fantasma não. */
  it('carregando vence vazio: mostra esqueleto, não o estado vazio', () => {
    const { container } = render(<CanvasBlockRenderer block={withoutData} loading />);
    expect(within(container).queryByText(/Sem dados no período/)).toBeNull();
  });
});

/**
 * O cartão de erro precisa dizer QUAL indicador falhou.
 *
 * Numa página com três blocos falhando, três cartões vermelhos idênticos não
 * dizem nada — o leitor tem de contar posições para descobrir qual perdeu.
 */
describe('o estado nomeia o bloco', () => {
  /**
   * O título existe DUAS vezes no DOM: no fantasma, que redesenha o bloco
   * inteiro, e no cartão da mensagem. Só o segundo é legível — o primeiro está
   * a 13% de opacidade e desfocado. As consultas olham o cartão.
   */
  const card = (c: HTMLElement): HTMLElement =>
    [...c.querySelectorAll('*')].find((e) => String(e.className).includes('backdrop-blur')) as HTMLElement;

  it('usa o título quando o bloco tem um', () => {
    const { container } = render(
      <CanvasBlockRenderer
        block={{ id: 'd', type: 'donut', metricId: 'm', title: 'Recebíveis', slices: [] }}
        error="Métrica inválida"
      />,
    );
    expect(within(card(container)).getByText('Recebíveis')).toBeTruthy();
  });

  it('usa o label nos blocos de um número só', () => {
    const { container } = render(
      <CanvasBlockRenderer
        block={{ id: 'g', type: 'gauge', metricId: 'm', label: 'Índice Recebível', value: Number.NaN, threshold: 1.2 }}
        error="Falhou"
      />,
    );
    expect(within(card(container)).getByText('Índice Recebível')).toBeTruthy();
  });

  /** Sem título nem label, o rótulo do contrato — melhor "Gráfico" que nada. */
  it('cai no rótulo do contrato quando o bloco não se nomeia', () => {
    const { container } = render(
      <CanvasBlockRenderer
        block={{ id: 'c', type: 'chart', metricId: 'm', chartType: 'line', xAxisKey: 'x', dataKeys: ['v'], data: [] }}
        error="Falhou"
      />,
    );
    expect(within(card(container)).getByText('Gráfico')).toBeTruthy();
  });

  /**
   * A linha que diz O QUE houve não pode ser a mais apagada do cartão — foi o
   * defeito corrigido no BlockError e repetido aqui na primeira versão.
   */
  it('o detalhe do erro fica em contraste de leitura, não esmaecido', () => {
    const { container } = render(
      <CanvasBlockRenderer
        block={{ id: 'd', type: 'donut', metricId: 'm', title: 'X', slices: [] }}
        error='Métrica "covenants.y" inválida'
      />,
    );
    const detail = within(card(container)).getByText(/covenants\.y/);
    expect(detail.className).toContain('text-muted-foreground');
    expect(detail.className).not.toMatch(/text-muted-foreground\/\d/);
  });

  /**
   * Só o ERRO tem fundo opaco. No vazio o translúcido é intencional — a
   * etiqueta é discreta e o fantasma pode aparecer por trás. No erro não: o
   * fantasma atravessava a linha que explica a falha.
   */
  it('o cartão do erro é opaco; o do vazio, translúcido', () => {
    const { container: withError } = render(
      <CanvasBlockRenderer
        block={{ id: 'd', type: 'donut', metricId: 'm', title: 'X', slices: [] }}
        error="Falhou"
      />,
    );
    expect(String(card(withError).className)).toMatch(/bg-popover(?!\/)/);

    const { container: empty } = render(
      <CanvasBlockRenderer
        block={{ id: 'd2', type: 'donut', metricId: 'm', title: 'X', slices: [] }}
      />,
    );
    expect(String(card(empty).className)).toContain('bg-popover/80');
  });

  /** O vazio não nomeia o bloco: ele não pede ação, e o título já está atrás. */
  it('só o erro nomeia o bloco', () => {
    const { container } = render(
      <CanvasBlockRenderer
        block={{ id: 'd', type: 'donut', metricId: 'm', title: 'Recebíveis', slices: [] }}
      />,
    );
    expect(within(card(container)).queryByText('Recebíveis')).toBeNull();
  });
});
