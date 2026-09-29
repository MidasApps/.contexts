import { describe, it, expect } from 'vitest';
import type { Metric } from '@/shared/schemas/metric';
import {
  reactsToPeriod, isSeries, acceptsSingleMonthTrim, regimeDeData, followsPeriodEnd,
} from '../period-sensitivity';

/**
 * Como o filtro de período alcança cada métrica — e são três respostas.
 *
 * Medido no catálogo real (`scripts/metrics/covenants-v2.mjs`, 64 templates):
 * 12 declaram `{filter.date_range}` e obedecem à faixa inteira; 45 fixam
 * `data_base_report = (SELECT MAX(...) WHERE {filter.ate})` — o `MAX` é
 * calculado DENTRO da faixa, então seguem o FIM do período; 7 não têm cláusula
 * de data nenhuma.
 *
 * ⚠️ A versão anterior desta nota dizia "nenhum filtro do app alcança esse
 * pin". Era verdade antes de `patch-covenants-snapshot-pin.mjs`, que já rodou.
 * A frase sobreviveu à migração, virou a fonte da leitura errada e sustentou o
 * defeito que a ADR-0027 corrige: a guarda do comparativo classificava os 45
 * pins como inertes e suprimia o selo de variação em todo KPI do produto.
 */

function buildMetric(over: Partial<Metric>): Metric {
  return {
    id: 'covenants.x',
    label: 'X',
    type: 'kpi',
    ...over,
  } as Metric;
}

const WITH_PERIOD = buildMetric({
  shape: 'scalar',
  recipe: {
    kind: 'sql',
    template: 'SELECT SUM(v) AS value FROM {t} WHERE {filter.date_range:t.data_base_report}',
  },
} as Partial<Metric>);

const PINNED = buildMetric({
  shape: 'scalar',
  recipe: {
    kind: 'sql',
    template: 'SELECT AVG(v) AS value FROM {t} WHERE {t.data_base_report} = (SELECT MAX({t.data_base_report}) FROM {t})',
  },
} as Partial<Metric>);

/**
 * O pin como ele existe HOJE em produção: o `MAX` é calculado DENTRO da faixa
 * escolhida (`{filter.ate}` = o fim do período). Escolher maio devolve o
 * número de maio; escolher julho, o de julho. Medido no dataset do Vila Rosa:
 * `indice_recebivel` vale 12,06 em mai/26, 8,31 em jun/26 e 7,00 em jul/26.
 */
const PINNED_TO_END = buildMetric({
  shape: 'scalar',
  recipe: {
    kind: 'sql',
    template:
      'SELECT AVG(v) AS value FROM {t} WHERE {t.data_base_report} = '
      + '(SELECT MAX({t.data_base_report}) FROM {t} WHERE {filter.ate:t.data_base_report})',
  },
} as Partial<Metric>);

const SERIES = buildMetric({
  shape: 'timeseries',
  recipe: {
    kind: 'sql',
    template: 'SELECT mes, v FROM {t} WHERE {filter.date_range:t.data_base_report} ORDER BY mes',
  },
} as Partial<Metric>);

describe('reactsToPeriod', () => {
  it('reconhece o placeholder de período no template', () => {
    expect(reactsToPeriod(WITH_PERIOD)).toBe(true);
  });

  /*
   * Vale para ESTE fixture, que é o pin CEGO: `MAX(...) FROM {t}` sem
   * `{filter.ate}`, calculado sobre a tabela toda. Não é o pin de produção —
   * generalizar esta frase para "o pin de snapshot" foi o erro que a ADR-0027
   * corrige. O de produção reage ao fim do período; ver `followsPeriodEnd`.
   */
  it('métrica fixada em MAX(data_base) não reage', () => {
    expect(reactsToPeriod(PINNED)).toBe(false);
  });

  /*
   * `aggregation` e `derived` não têm template: o resolver os monta a partir
   * dos filtros de página, então o período entra por construção.
   */
  it('recipe montado pelo resolver reage por construção', () => {
    const aggregated = buildMetric({
      recipe: { kind: 'aggregation', valueAttribute: 't.v', groupByAttributes: [], filters: [] },
    } as unknown as Partial<Metric>);
    expect(reactsToPeriod(aggregated)).toBe(true);
  });

  it('métrica sem recipe não reage — não há consulta a recortar', () => {
    expect(reactsToPeriod(buildMetric({}))).toBe(false);
    expect(reactsToPeriod(undefined)).toBe(false);
  });
});

describe('isSeries', () => {
  it.each(['timeseries', 'timeseries_multi', 'timeseries_pivot'])('%s é série', (shape) => {
    expect(isSeries(buildMetric({ shape } as Partial<Metric>))).toBe(true);
  });

  it.each(['scalar', 'breakdown', 'rows', 'matrix'])('%s não é série', (shape) => {
    expect(isSeries(buildMetric({ shape } as Partial<Metric>))).toBe(false);
  });

  it('sem shape declarado não assume série', () => {
    expect(isSeries(buildMetric({}))).toBe(false);
  });
});

describe('acceptsSingleMonthTrim', () => {
  it('escalar que reage ao período aceita', () => {
    expect(acceptsSingleMonthTrim(WITH_PERIOD)).toBe(true);
  });

  /*
   * O ponto do desenho: recortar uma série a um mês a transforma num ponto
   * solto. O modo "Último mês" fala do número, não do eixo do tempo.
   */
  it('série NÃO aceita, mesmo reagindo ao período', () => {
    expect(reactsToPeriod(SERIES)).toBe(true);
    expect(acceptsSingleMonthTrim(SERIES)).toBe(false);
  });

  it('métrica já fixada no último mês não tem o que recortar', () => {
    expect(acceptsSingleMonthTrim(PINNED)).toBe(false);
  });
});

/**
 * Três regimes, não dois — e a mensagem do bloco depende de qual é.
 *
 * Dizer "posição em jul/26" num gráfico que exibe abril a julho é afirmação
 * falsa sobre o que está na tela. Foi o que a primeira versão da nota fez com
 * o empilhado de faixas de atraso e com o "Entradas & Saídas", que não têm
 * cláusula de data nenhuma.
 */
describe('regimeDeData', () => {
  const sql = (template: string) => buildMetric({
    recipe: { kind: 'sql', template },
  } as unknown as Partial<Metric>);

  it('com placeholder de período → periodo', () => {
    expect(regimeDeData(sql('SELECT v FROM {t} WHERE {filter.date_range:t.d}'))).toBe('periodo');
  });

  it('fixada no MAX(data_base_report) → posicao', () => {
    expect(regimeDeData(sql(
      'SELECT v FROM {t} WHERE {t.data_base_report} = (SELECT MAX({t.data_base_report}) FROM {t})',
    ))).toBe('posicao');
  });

  it('sem cláusula de data nenhuma → historico', () => {
    expect(regimeDeData(sql('SELECT mes, v FROM {t} GROUP BY mes ORDER BY mes'))).toBe('historico');
  });

  /*
   * O `MAX(` solto era aceito como prova de pin. Uma métrica que agrega com
   * `MAX()` sobre uma coluna de VALOR e não tem cláusula de data nenhuma lê a
   * união de todos os snapshots — e receberia a nota "posição em jul/26"
   * embaixo dela. Afirmação falsa sobre o que está na tela é exatamente o que
   * esta função existe para evitar; a peneira tem de ser a coluna de
   * snapshot, não a função de agregação.
   */
  it('MAX() sobre coluna de valor, sem cláusula de data, é histórico', () => {
    expect(regimeDeData(sql('SELECT MAX({t.valor_contrato}) AS value FROM {t}'))).toBe('historico');
  });

  /* A variante do pin que não usa `=`: continua sendo posição. */
  it('pin escrito com IN também é posição', () => {
    expect(regimeDeData(sql(
      'SELECT v FROM {t} WHERE {t.data_base_report} IN (SELECT MAX({t.data_base_report}) FROM {t})',
    ))).toBe('posicao');
  });

  it('recipe montado pelo resolver obedece ao período', () => {
    expect(regimeDeData(buildMetric({
      recipe: { kind: 'aggregation', valueAttribute: 't.v', groupByAttributes: [], filters: [] },
    } as unknown as Partial<Metric>))).toBe('periodo');
  });
});

/**
 * O bloco muda quando o usuário mexe no FIM do período?
 *
 * Pergunta diferente de `reactsToPeriod`, e a diferença custou caro: aquele
 * predicado só procura `{filter.date_range}`, então classificava como inerte
 * as 45 métricas cujo pin é calculado dentro da faixa. Quem consome isso é a
 * guarda de `applyComparisonToBlock` — resultado: o selo de variação, que só
 * KPI, medidor e progresso sabem desenhar, era suprimido em exatamente os 50
 * blocos que sabem desenhá-lo. O controle "Comparar" existia, disparava a
 * segunda consulta, recebia outro número e não escrevia nada na tela.
 */
describe('followsPeriodEnd', () => {
  const sql = (template: string) => buildMetric({
    recipe: { kind: 'sql', template },
  } as unknown as Partial<Metric>);

  it('pin calculado dentro da faixa segue o fim do período', () => {
    expect(followsPeriodEnd(PINNED_TO_END)).toBe(true);
  });

  it('quem já obedece à faixa inteira também segue', () => {
    expect(followsPeriodEnd(WITH_PERIOD)).toBe(true);
  });

  /** Pin cego no MAX da tabela: nenhum filtro o alcança, e o selo mentiria. */
  it('pin sem {filter.ate} não segue', () => {
    expect(followsPeriodEnd(PINNED)).toBe(false);
  });

  it('sem cláusula de data nenhuma não segue', () => {
    expect(followsPeriodEnd(sql('SELECT mes, v FROM {t} GROUP BY mes'))).toBe(false);
  });

  it('recipe montado pelo resolver segue por construção', () => {
    expect(followsPeriodEnd(buildMetric({
      recipe: { kind: 'aggregation', valueAttribute: 't.v', groupByAttributes: [], filters: [] },
    } as unknown as Partial<Metric>))).toBe(true);
  });

  /*
   * As chaves de `{filter.X}` são nomes livres, declarados em
   * `metricPageFilters` pelo template. Procurar o PREFIXO `{filter.ate` faz
   * qualquer filtro cujo nome comece por "ate" — `atendimento`, `atesto` —
   * passar por pin de período. O bloco receberia o selo de variação com as
   * duas consultas devolvendo o mesmo número: exatamente o "0,0% sem
   * comparação" que a guarda existe para impedir. O placeholder termina em
   * `:` ou `}`; é aí que a comparação tem de terminar também.
   */
  it('filtro de nome parecido não é confundido com o pin de período', () => {
    expect(followsPeriodEnd(sql(
      'SELECT SUM(v) AS value FROM {t} WHERE {filter.atendimento:t.canal}',
    ))).toBe(false);
    expect(reactsToPeriod(sql(
      'SELECT SUM(v) AS value FROM {t} WHERE {filter.date_range_previsto:t.d}',
    ))).toBe(false);
  });

  it('as duas grafias do placeholder continuam valendo', () => {
    expect(followsPeriodEnd(sql('SELECT v FROM {t} WHERE {filter.ate}'))).toBe(true);
    expect(followsPeriodEnd(sql('SELECT v FROM {t} WHERE {filter.ate:t.d}'))).toBe(true);
    expect(reactsToPeriod(sql('SELECT v FROM {t} WHERE {filter.date_range}'))).toBe(true);
    expect(reactsToPeriod(sql('SELECT v FROM {t} WHERE {filter.date_range:t.d}'))).toBe(true);
  });
});
