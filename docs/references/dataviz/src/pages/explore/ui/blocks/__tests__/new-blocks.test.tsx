/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  ComparisonBlock as ComparisonBlockType, HeatmapBlock as HeatmapBlockType,
  ProgressBlock as ProgressBlockType, SparkRowsBlock as SparkRowsBlockType,
  TargetsBlock as TargetsBlockType, DonutBlock as DonutBlockType,
} from '@/shared/config/agents/types';
import { TargetsBlock } from '../TargetsBlock';
import { ProgressBlock } from '../ProgressBlock';
import { ComparisonBlock } from '../ComparisonBlock';
import { SparkRowsBlock } from '../SparkRowsBlock';
import { HeatmapBlock } from '../HeatmapBlock';
import { DonutBlock } from '../DonutBlock';
import { GaugeBlock } from '../GaugeBlock';
import { BLOCK_SHELL } from '../block-shell';

/**
 * Os blocos novos, pelo comportamento que justifica cada um existir.
 *
 * Não são testes de pixel: cada `it` fixa a decisão que o bloco toma sobre o
 * dado — o que ele faz com meta ausente, com célula ausente, com percentual.
 * São essas decisões que a página inteira herda.
 */

describe('TargetsBlock', () => {
  const base: TargetsBlockType = {
    id: 'tg', type: 'targets', metricId: 'm', suffix: 'x', decimals: 2,
    items: [
      { label: 'Índice de cobertura', value: 1.38, target: 1.2 },
      { label: 'Índice de obra', value: 0.94, target: 1.2 },
    ],
  };

  it('bullet é um BarChart do Recharts, uma barra por item', () => {
    const { container } = render(<TargetsBlock block={base} />);
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
  });

  /**
   * A normalização é o que torna metas diferentes comparáveis: todas caem em
   * 100%. Sem a linha de referência, o eixo em percentual não diz nada.
   */
  it('bullet marca a meta de todos na mesma vertical', () => {
    const { container } = render(<TargetsBlock block={base} />);
    expect(container.querySelector('.recharts-reference-line')).toBeTruthy();
    expect(within(container).getByText(/eixo em % da meta/)).toBeTruthy();
  });

  it('lista não desenha gráfico — troca a distância por densidade', () => {
    const { container } = render(<TargetsBlock block={{ ...base, display: 'list' }} />);
    expect(container.querySelector('.recharts-wrapper')).toBeNull();
    // Escopado ao container: o Recharts deixa um `#recharts_measurement_span`
    // no <body> com o último texto medido, e ele sobrevive ao cleanup.
    expect(within(container).getByText('Índice de cobertura')).toBeTruthy();
    // Os dois itens da fixture têm a mesma meta — um por item.
    expect(within(container).getAllByText(/mín 1,20x/)).toHaveLength(2);
  });

  it('escala invertida chama o limite de máximo, não de mínimo', () => {
    const { container } = render(<TargetsBlock block={{ ...base, display: 'list', reverseScale: true }} />);
    expect(within(container).getAllByText(/máx 1,20x/)).toHaveLength(2);
    expect(within(container).queryByText(/mín/)).toBeNull();
  });

  it('sem itens mostra vazio, e vazio não é erro', () => {
    render(<TargetsBlock block={{ ...base, items: [] }} />);
    expect(screen.getByText(/não retornou linhas/i)).toBeTruthy();
  });

  // Rótulo não é identidade: dois corretores homônimos são duas linhas. Com o
  // rótulo como key, o React acusava chave duplicada e podia fundir as linhas.
  it.each(['list', 'bullet'] as const)('rótulos repetidos não colidem (%s)', (display) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items = [
      { label: 'Ana Barbosa', value: 10, target: 8 },
      { label: 'Ana Barbosa', value: 4, target: 8 },
    ];
    render(<TargetsBlock block={{ ...base, display, items }} />);
    const duplicateKey = errors.mock.calls.some((args) => String(args[0]).includes('same key'));
    errors.mockRestore();
    expect(duplicateKey).toBe(false);
  });
});

describe('ProgressBlock', () => {
  const base: ProgressBlockType = {
    id: 'p', type: 'progress', metricId: 'm', label: 'Repasses no mês',
    target: 5_000_000, value: 3_900_000, format: 'currency',
  };

  it('mostra o percentual atingido — a pergunta "quanto falta"', () => {
    render(<ProgressBlock block={base} />);
    expect(screen.getByText('78%')).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('78');
  });

  /** Meta zero não gera percentual: "Infinity% da meta" é pior que omitir. */
  it('meta zero não produz percentual', () => {
    render(<ProgressBlock block={{ ...base, target: 0 }} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
  });

  it('acima de 100% a barra satura mas o número continua verdadeiro', () => {
    render(<ProgressBlock block={{ ...base, value: 6_000_000 }} />);
    expect(screen.getByText('120%')).toBeTruthy();
  });

  /** A meta é configuração: sem valor da métrica ela continua na tela. */
  it('sem valor ainda mostra a meta', () => {
    render(<ProgressBlock block={{ ...base, value: undefined }} loading />);
    expect(screen.getByText(/previstos/)).toBeTruthy();
  });
});

describe('ComparisonBlock', () => {
  const base: ComparisonBlockType = {
    id: 'c', type: 'comparison', metricId: 'm', label: 'Inadimplência 90+',
    current: 4.81, previous: 5.24, format: 'number', decimals: 2,
    positiveIsGood: false,
  };

  /**
   * Variação relativa de um percentual mente sobre a grandeza: de 5,24% para
   * 4,81% a variação é −8,2%, número correto que ninguém no mercado usa.
   */
  it('deltaAsPoints exibe a diferença em pontos percentuais', () => {
    render(<ComparisonBlock block={{ ...base, deltaAsPoints: true }} />);
    expect(screen.getByText(/0,43 p\.p\./)).toBeTruthy();
  });

  it('sem deltaAsPoints exibe a variação relativa', () => {
    render(<ComparisonBlock block={base} />);
    expect(screen.getByText(/8,2%/)).toBeTruthy();
  });

  it('cair é melhora quando subir é ruim', () => {
    render(<ComparisonBlock block={base} />);
    expect(screen.getByText('de melhora')).toBeTruthy();
  });

  it('cair é piora quando subir é bom', () => {
    render(<ComparisonBlock block={{ ...base, positiveIsGood: true }} />);
    expect(screen.getByText('de piora')).toBeTruthy();
  });

  /** Comparação exige DOIS pontos: com um só não há o que comparar. */
  it('sem o ponto anterior não inventa diferença', () => {
    render(<ComparisonBlock block={{ ...base, previous: undefined }} />);
    expect(screen.queryByText(/de melhora|de piora/)).toBeNull();
  });
});

describe('SparkRowsBlock', () => {
  const base: SparkRowsBlockType = {
    id: 's', type: 'sparkrows', metricId: 'm',
    series: [
      { name: 'saldo_devedor', points: [10, 12, 14] },
      { name: 'inadimplencia', points: [5, 4, 3] },
    ],
  };

  it('uma linha por série, com o valor mais recente', () => {
    render(<SparkRowsBlock block={base} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByLabelText(/Saldo Devedor: tendência de alta/i)).toBeTruthy();
    // `humanizeColumnName` tem dicionário: 'inadimplencia' → 'Inadimplência'.
    expect(screen.getByLabelText(/Inadimplência: tendência de baixa/i)).toBeTruthy();
  });

  /**
   * A sparkline daqui tem de ser a MESMA do `KpiCard`: curva `monotone` com
   * gradiente, desenhada pelo Recharts. A primeira versão era um `<path>` de
   * segmentos retos — duas sparklines no mesmo produto com aparências
   * diferentes, que é a inconsistência que este trabalho veio eliminar.
   */
  it('a curva é um AreaChart do Recharts, como a do KpiCard', () => {
    const { container } = render(<SparkRowsBlock block={base} />);
    expect(container.querySelectorAll('.recharts-area-curve')).toHaveLength(2);
    expect(container.querySelectorAll('.recharts-area-area')).toHaveLength(2);
    // Gradiente com id próprio por linha: dois blocos na mesma página não
    // podem compartilhar o `url(#...)` do preenchimento.
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** Série constante desenha uma reta no meio, em vez de dividir por zero. */
  it('série sem variação não quebra', () => {
    render(<SparkRowsBlock block={{ ...base, series: [{ name: 'flat', points: [7, 7, 7] }] }} />);
    expect(screen.getByLabelText(/tendência estável/i)).toBeTruthy();
  });
});

describe('HeatmapBlock', () => {
  const base: HeatmapBlockType = {
    id: 'h', type: 'heatmap', metricId: 'm', rowLabel: 'Safra', colLabel: 'Meses',
    format: 'percent', decimals: 1,
    cells: [
      { row: '2024', col: '6m', value: 0.02 },
      { row: '2024', col: '12m', value: 0.05 },
      { row: '2025', col: '6m', value: 0.03 },
      // 2025 × 12m ausente de propósito: a safra ainda não tem 12 meses.
    ],
  };

  /**
   * Numa matriz de safra, "ainda não aconteceu" e "aconteceu e deu zero" são
   * conclusões OPOSTAS. Pintar as duas igual inverteria a leitura.
   */
  it('célula ausente não é desenhada — a grade tem 4 posições e 3 símbolos', () => {
    const { container } = render(<HeatmapBlock block={base} />);
    // 2 safras × 2 janelas = 4 posições; a fixture traz 3 valores.
    expect(container.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(3);
  });

  it('os eixos trazem as safras e as janelas na ordem dos dados', () => {
    const { container } = render(<HeatmapBlock block={base} />);
    // O Recharts 3.x hoista os rótulos de tick para uma camada própria: eles
    // NÃO ficam dentro de `.recharts-yAxis`. Mesma consulta do ChartBlock.test.
    const yAxis = container.querySelector('.recharts-yAxis-tick-labels')?.textContent ?? '';
    expect(yAxis).toContain('2024');
    expect(yAxis).toContain('2025');
    // A ordem é a dos dados, não a alfabética: safra nova depois da antiga.
    expect(yAxis.indexOf('2024')).toBeLessThan(yAxis.indexOf('2025'));

    const xAxis = container.querySelector('.recharts-xAxis-tick-labels')?.textContent ?? '';
    expect(xAxis).toContain('6m');
    expect(xAxis).toContain('12m');
  });

  it('sem células mostra vazio', () => {
    render(<HeatmapBlock block={{ ...base, cells: [] }} />);
    expect(screen.getByText(/não retornou linhas/i)).toBeTruthy();
  });
});

describe('DonutBlock — display bar', () => {
  const base: DonutBlockType = {
    id: 'd', type: 'donut', metricId: 'm', display: 'bar', format: 'number',
    slices: [{ name: 'Pré', value: 60 }, { name: 'Pós', value: 40 }],
  };

  it('a barra descreve a composição em percentual', () => {
    render(<DonutBlock block={base} />);
    expect(screen.getByLabelText(/Composição: Pré 60,0%, Pós 40,0%/)).toBeTruthy();
  });

  it('total zero não divide por zero', () => {
    render(<DonutBlock block={{ ...base, slices: [{ name: 'Vazio', value: 0 }] }} />);
    expect(screen.getByLabelText(/Vazio 0,0%/)).toBeTruthy();
  });
});

/**
 * A régua de aparência: raio, respiro e superfície saem de um lugar só.
 *
 * Antes, `KpiCard` e `ChartWidget` usavam `rounded-2xl p-5` e o `GaugeBlock`
 * `rounded-xl p-4` — a mesma linha com dois raios. Este teste é o que impede a
 * divergência de voltar sem que alguém a escolha.
 */
describe('casca compartilhada', () => {
  it('os blocos que desenham o próprio card usam a mesma casca', () => {
    const classes = BLOCK_SHELL.split(' ');
    expect(classes).toContain('rounded-2xl');
    expect(classes).toContain('p-5');
    expect(classes).toContain('bg-popover');

    const { container } = render(
      <ProgressBlock block={{ id: 'p', type: 'progress', label: 'L', target: 10, value: 5 }} />,
    );
    const card = container.querySelector('.rounded-2xl');
    expect(card).not.toBeNull();
    expect(card!.className).toContain('p-5');
  });
});

/**
 * O gauge, depois que o arco saiu.
 *
 * A tela denunciou três coisas de uma vez: o arco saía com ~90px porque o
 * Recharts deriva raio percentual de `min(largura, altura)`; o número a 30px
 * não cabia na abertura dele; e a régua fixa em 2× o limite saturava com o
 * Índice Recebível real (8,31x contra mínimo de 1,20x), travando o desenho em
 * 100% e imprimindo "folga de 592,3%".
 */
describe('GaugeBlock — medidor horizontal', () => {
  const base = {
    id: 'g', type: 'gauge' as const, label: 'Índice Recebível',
    value: 8.31, threshold: 1.2, warnThreshold: 1.5, suffix: 'x', decimals: 2,
  };

  it('desenha as faixas e a marca do limite', () => {
    const { container } = render(<GaugeBlock block={base} />);
    expect(container.querySelectorAll('.recharts-reference-area').length).toBeGreaterThan(0);
    expect(container.querySelector('.recharts-reference-line')).toBeTruthy();
    expect(container.querySelector('.recharts-bar-rectangle')).toBeTruthy();
  });

  it('o número é o elemento dominante, na régua tipográfica', () => {
    const { container } = render(<GaugeBlock block={base} />);
    const value = within(container).getByText('8,31');
    expect(value.className).toContain('text-3xl');
  });

  it('longe do limite, fala em múltiplo e não em percentual absurdo', () => {
    const { container } = render(<GaugeBlock block={base} />);
    expect(within(container).getByText(/6,9× o mínimo/)).toBeTruthy();
    expect(within(container).queryByText(/592/)).toBeNull();
  });

  it('perto do limite, volta ao percentual', () => {
    const { container } = render(<GaugeBlock block={{ ...base, value: 1.38 }} />);
    expect(within(container).getByText(/folga de 15,0%/)).toBeTruthy();
  });

  it('carregando não pinta veredito nem desenha a barra de valor', () => {
    const { container } = render(<GaugeBlock block={{ ...base, value: 0 }} loading />);
    expect(container.querySelector('.recharts-bar-rectangle')).toBeNull();
    expect(within(container).queryByText(/folga|mínimo/)).toBeNull();
  });
});
