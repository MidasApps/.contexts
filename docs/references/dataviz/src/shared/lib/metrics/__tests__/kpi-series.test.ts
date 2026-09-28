import { describe, it, expect } from 'vitest';
import { kpiMonthlySeries } from '../kpi-series';

/**
 * A série mensal que falta a todo KPI do produto.
 *
 * Os 46 cartões do Vila Rosa exibem UM número — o do mês escolhido — e nenhum
 * deles declara `sparklineMetricId`. O caminho de render está pronto e vazio há
 * meses: `SingleKpiBlock` já passa `sparklineData`/`sparklineMonths` ao card, e
 * o modal já tem o texto "Dados históricos não disponíveis" para quando não
 * chegam. O que falta é a métrica de série.
 *
 * Gerá-la à mão 32 vezes seria 32 chances de errar em silêncio. O pin tem forma
 * regular (`snapshotKpi()`/`pinClause()`), então a transformação é mecânica:
 * troca-se o pin pela faixa e agrupa-se por mês. O que este módulo NÃO
 * reconhecer, ele recusa — sparkline de menos é lacuna, sparkline errada é
 * afirmação falsa sobre a carteira.
 */

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

const pin = (ent: string) =>
  `{${ent}.data_base_report} = (SELECT MAX({${ent}.data_base_report}) `
  + `FROM {${ent}} WHERE {filter.ate:${ent}.data_base_report})`;

describe('kpiMonthlySeries — agregado simples', () => {
  it('troca o pin pela faixa e agrupa por mês', () => {
    const r = kpiMonthlySeries(
      `SELECT AVG({covenants_calculo.vuv3_m2}) AS value
       FROM {covenants_calculo}
       WHERE ${pin('covenants_calculo')}`,
    );

    expect(r.ok).toBe(true);
    expect(norm(r.ok ? r.template : '')).toBe(norm(`
      SELECT DATE_TRUNC({covenants_calculo.data_base_report}, MONTH) AS bucket,
             AVG({covenants_calculo.vuv3_m2}) AS value
      FROM {covenants_calculo}
      WHERE {filter.date_range:covenants_calculo.data_base_report}
      GROUP BY bucket
      ORDER BY bucket
    `));
  });

  /*
   * O recorte de negócio (status do contrato, permuta, pavimento) tem de
   * sobreviver: uma série de "contratos ativos" que conte distratados junto
   * desenharia uma curva que não é a do cartão acima dela.
   */
  it('preserva os filtros de negócio que acompanhavam o pin', () => {
    const r = kpiMonthlySeries(
      `SELECT COUNT(DISTINCT {contratos.id_contrato}) AS value
       FROM {contratos}
       WHERE ${pin('contratos')}
         AND UPPER({contratos.status_contrato}) = 'ATIVO'`,
    );

    expect(r.ok).toBe(true);
    const t = norm(r.ok ? r.template : '');
    expect(t).toContain("AND UPPER({contratos.status_contrato}) = 'ATIVO'");
    expect(t).toContain('WHERE {filter.date_range:contratos.data_base_report}');
    expect(t).not.toContain('filter.ate');
    expect(t).not.toContain('SELECT MAX(');
  });

  it('aceita expressão composta como SAFE_DIVIDE', () => {
    const r = kpiMonthlySeries(
      `SELECT SAFE_DIVIDE(SUM({contratos.valor_atraso}), SUM({contratos.saldo_devedor})) AS value
       FROM {contratos}
       WHERE ${pin('contratos')}`,
    );

    expect(r.ok).toBe(true);
    expect(norm(r.ok ? r.template : '')).toContain(
      'SAFE_DIVIDE(SUM({contratos.valor_atraso}), SUM({contratos.saldo_devedor})) AS value',
    );
  });
});

/**
 * A medição de obra não agrega: ela escolhe UMA linha por `ORDER BY … LIMIT 1`.
 * Repetir isso por mês exige janela — sem ela, `GROUP BY` sobre coluna crua nem
 * compila, e trocar por `MAX()` mudaria a semântica (o maior acumulado do mês
 * não é a última medição do mês).
 */
describe('kpiMonthlySeries — última linha do mês', () => {
  it('vira ROW_NUMBER particionado por mês', () => {
    const r = kpiMonthlySeries(
      `SELECT {evolucao_obra.realizado_acumulado} AS value
       FROM {evolucao_obra}
       WHERE ${pin('evolucao_obra')}
         AND {evolucao_obra.data_medicao} <= {evolucao_obra.data_base_report}
         AND {evolucao_obra.realizado_acumulado} IS NOT NULL
       ORDER BY {evolucao_obra.data_medicao} DESC
       LIMIT 1`,
    );

    expect(r.ok).toBe(true);
    const t = norm(r.ok ? r.template : '');
    expect(t).toContain(
      'QUALIFY ROW_NUMBER() OVER (PARTITION BY DATE_TRUNC({evolucao_obra.data_base_report}, MONTH) '
      + 'ORDER BY {evolucao_obra.data_medicao} DESC) = 1',
    );
    expect(t).toContain('AND {evolucao_obra.realizado_acumulado} IS NOT NULL');
    expect(t).not.toContain('LIMIT 1');
    expect(t).not.toContain('GROUP BY');
  });
});

/**
 * O que ele se recusa a gerar.
 *
 * Recusa é o comportamento seguro: o KPI fica sem sparkline, que é o estado de
 * hoje. Gerar SQL plausível e errado colocaria uma curva inventada embaixo de
 * um número certo.
 */
describe('kpiMonthlySeries — recusas', () => {
  it('recusa KPI cujo valor é uma data', () => {
    const r = kpiMonthlySeries(
      `SELECT MAX({certidoes.data_consulta}) AS value
       FROM {certidoes}
       WHERE ${pin('certidoes')}`,
    );

    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/data/i);
  });

  it('recusa template sem o pin — não há o que converter', () => {
    const r = kpiMonthlySeries(
      'SELECT SUM({t.v}) AS value FROM {t} WHERE {filter.date_range:t.data_base_report}',
    );

    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/pin/i);
  });

  it('recusa forma que não reconhece', () => {
    const r = kpiMonthlySeries('WITH x AS (SELECT 1) SELECT * FROM x');

    expect(r.ok).toBe(false);
  });

  /*
   * Coluna crua sem `ORDER BY … LIMIT 1` não tem regra de desempate: qual das
   * N linhas do mês seria o ponto? Adivinhar é inventar.
   */
  it('recusa coluna crua sem critério de última linha', () => {
    const r = kpiMonthlySeries(
      `SELECT {contratos.saldo_devedor} AS value FROM {contratos} WHERE ${pin('contratos')}`,
    );

    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/agrega|linha/i);
  });
});

/**
 * ─── Os buracos da cirurgia textual ───
 *
 * O gerador não faz parse de SQL: ele recorta strings. Toda forma que ele
 * ACEITAR e traduzir errado vira uma curva inventada embaixo de um número
 * certo — e a pior das formas erradas é a que produz SQL VÁLIDO, porque a
 * validação contra o dado (`scripts/add-kpi-sparklines.ts`) só compara o
 * ÚLTIMO ponto com o valor do cartão. Série cujo último ponto bate e cujos
 * anteriores mentem passa no portão sem ninguém ver.
 *
 * Cada caso abaixo é uma forma que o gerador lia mal. A resposta certa é quase
 * sempre RECUSAR: o KPI fica sem sparkline, que é o estado de hoje.
 */

describe('kpiMonthlySeries — o pin precisa ser condição de topo', () => {
  /*
   * O `WHERE` de fora não tem pin nenhum: a métrica lê TODOS os snapshots, e o
   * pin está lá dentro escolhendo o universo do `IN`. Tirá-lo deixava
   * `WHERE )`; se um dia não deixasse, seria a série de uma pergunta que o
   * cartão não faz.
   */
  it('recusa pin que vive só dentro de subconsulta', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} `
      + `WHERE {t.id} IN (SELECT {t.id} FROM {t} WHERE ${pin('t')})`,
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/topo|subconsulta/i);
  });

  /*
   * `replace()` sem `g` tira o primeiro e deixa o segundo. O que sobrava era
   * SQL válido E pinado: um único mês, agrupado por mês — o pior dos dois
   * mundos, porque compila.
   */
  it('recusa template com mais de um pin', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} WHERE ${pin('t')} AND ${pin('t')}`,
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/mais de um pin/i);
  });

  /* `A OR pin` não é `A`: remover um lado de um OR troca a pergunta. */
  it('recusa pin encadeado por OR', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} WHERE {t.a} = 1 OR ${pin('t')}`,
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/\bOR\b/);
  });

  /* Entidade cujo nome é prefixo de outra não pode casar pelo prefixo. */
  it('não confunde entidade com outra de nome parecido', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({cov.v}) AS value FROM {cov} WHERE ${pin('cov_extra')}`,
    );
    expect(r.ok).toBe(false);
  });
});

describe('kpiMonthlySeries — o que sobra do WHERE', () => {
  /*
   * Condição de negócio dos DOIS lados do pin. Tirar só o pin deixava
   * `{t.a} = 1 AND  AND {t.b} = 2` — SQL inválido, e por isso um KPI que
   * merecia sparkline ficava sem, sem ninguém saber por quê.
   */
  it('remove o pin do meio sem deixar AND órfão', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} `
      + `WHERE {t.a} = 1 AND ${pin('t')} AND {t.b} = 2`,
    );
    expect(r.ok).toBe(true);
    const t = norm(r.ok ? r.template : '');
    expect(t).toContain('AND {t.a} = 1 AND {t.b} = 2');
    expect(t).not.toMatch(/AND\s+AND/i);
  });

  /*
   * O caso que atravessa o portão de validação. `{filter.ate}` fora do pin
   * recorta por uma data que, na série, vale a faixa INTEIRA em todos os
   * meses: o último ponto bate com o cartão e todos os anteriores contam
   * eventos que naquele mês ainda não tinham acontecido.
   */
  it('recusa filtro de data que sobrou fora do pin', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} `
      + `WHERE ${pin('t')} AND {filter.ate:t.data_venda}`,
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/filtro de data/i);
  });

  it.each(['{filter.date_range:t.data_venda}', '{filter.snapshot:t.data_venda}'])(
    'recusa também %s residual',
    (residual) => {
      const r = kpiMonthlySeries(
        `SELECT SUM({t.v}) AS value FROM {t} WHERE ${pin('t')} AND ${residual}`,
      );
      expect(r.ok).toBe(false);
    },
  );

  /* Filtro de página que não mexe na data (projetos) é ortogonal ao mês. */
  it('preserva filtro de página que não recorta o tempo', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} `
      + `WHERE ${pin('t')} AND {filter.projetos:t.projeto}`,
    );
    expect(r.ok).toBe(true);
    expect(norm(r.ok ? r.template : '')).toContain('AND {filter.projetos:t.projeto}');
  });
});

describe('kpiMonthlySeries — a cauda depois do WHERE', () => {
  /*
   * Regressão: a regex de última linha exigia espaço ANTES de `ORDER BY`, e o
   * texto chegava já aparado. Sem outra condição de negócio entre o pin e o
   * `ORDER BY`, o KPI era recusado por "não há ORDER BY" tendo um.
   */
  it('aceita ORDER BY … LIMIT 1 colado no pin', () => {
    const r = kpiMonthlySeries(
      `SELECT {t.v} AS value FROM {t} WHERE ${pin('t')} ORDER BY {t.d} DESC LIMIT 1`,
    );
    expect(r.ok).toBe(true);
    expect(norm(r.ok ? r.template : '')).toContain(
      'QUALIFY ROW_NUMBER() OVER (PARTITION BY DATE_TRUNC({t.data_base_report}, MONTH) '
      + 'ORDER BY {t.d} DESC) = 1',
    );
  });

  it('ponto-e-vírgula final não vira condição', () => {
    const r = kpiMonthlySeries(`SELECT SUM({t.v}) AS value FROM {t} WHERE ${pin('t')};`);
    expect(r.ok).toBe(true);
    expect(norm(r.ok ? r.template : '')).not.toContain(';');
  });

  /* Tudo isto ia parar dentro do WHERE, colado num `AND`. */
  it.each([
    ['GROUP BY próprio', 'GROUP BY {t.k}'],
    ['HAVING', 'GROUP BY {t.k} HAVING SUM({t.v}) > 0'],
    ['UNION', 'UNION ALL SELECT 1 AS value FROM {t} WHERE 1=1'],
    ['LIMIT sem ORDER BY', 'LIMIT 1'],
    ['LIMIT maior que 1', 'ORDER BY {t.d} LIMIT 5'],
  ])('recusa %s', (_name, tail) => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} WHERE ${pin('t')} ${tail}`,
    );
    expect(r.ok).toBe(false);
  });

  /*
   * Dois `ORDER BY`, um deles dentro de subconsulta. A regex não-gulosa casava
   * do PRIMEIRO até o último `LIMIT 1`, engolindo a condição inteira e
   * mandando `{t2.d} LIMIT 1) ORDER BY {t.d} DESC` para dentro da janela.
   *
   * A leitura por nível de fora resolve sem recusar: o `ORDER BY` de dentro é
   * conteúdo da condição — sai verbatim, porque uma subconsulta escalar sobre
   * outra entidade não depende do mês — e só o de fora vira a regra da janela.
   */
  it('ignora o ORDER BY que está dentro de subconsulta', () => {
    const r = kpiMonthlySeries(
      `SELECT {t.v} AS value FROM {t} WHERE ${pin('t')} `
      + `AND {t.x} = (SELECT {t2.y} FROM {t2} ORDER BY {t2.d} LIMIT 1) `
      + `ORDER BY {t.d} DESC LIMIT 1`,
    );
    expect(r.ok).toBe(true);
    const t = norm(r.ok ? r.template : '');
    expect(t).toContain('AND {t.x} = (SELECT {t2.y} FROM {t2} ORDER BY {t2.d} LIMIT 1)');
    expect(t).toContain('ORDER BY {t.d} DESC) = 1');
  });

  /*
   * Subconsulta na condição, mas sobre a PRÓPRIA entidade e com pin dentro: o
   * universo do `IN` continuaria congelado no último snapshot enquanto o
   * bucket anda — outra vez a curva plana embaixo do número certo. Quem pega
   * isto é a guarda de filtro de data residual, que enxerga o `{filter.ate}`
   * do pin aninhado.
   */
  it('recusa subconsulta de condição que carrega um pin dentro', () => {
    const r = kpiMonthlySeries(
      `SELECT SUM({t.v}) AS value FROM {t} WHERE ${pin('t')} `
      + `AND {t.id} IN (SELECT {t.id} FROM {t} WHERE ${pin('t')})`,
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/filtro de data/i);
  });
});

describe('kpiMonthlySeries — a expressão do valor', () => {
  /*
   * O `AS value FROM {t} WHERE` da subconsulta era encontrado ANTES do de
   * fora, e o gerador partia o SQL no lugar errado. Mesmo lendo o certo, uma
   * subconsulta pinada no numerador ou no denominador continuaria presa a um
   * mês: a curva seria plana onde não é.
   */
  it('recusa subconsulta dentro da expressão do valor', () => {
    const r = kpiMonthlySeries(
      `SELECT SAFE_DIVIDE({t.a}, (SELECT SUM({t.b}) AS value FROM {t} WHERE ${pin('t')})) `
      + `AS value FROM {t} WHERE ${pin('t')}`,
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/subconsulta/i);
  });

  /*
   * `AS value FROM {t} WHERE` dentro de string literal é texto, não estrutura.
   * O gerador cortava ali e montava um SQL que só não quebrava por acaso.
   */
  it('não parte o SQL num `AS value` que está dentro de literal', () => {
    const r = kpiMonthlySeries(
      `SELECT COUNTIF({t.obs} = 'x AS value FROM {t} WHERE 1=1') AS value `
      + `FROM {t} WHERE ${pin('t')}`,
    );
    expect(r.ok).toBe(true);
    const t = norm(r.ok ? r.template : '');
    expect(t).toContain("COUNTIF({t.obs} = 'x AS value FROM {t} WHERE 1=1') AS value");
    expect(t).toContain('WHERE {filter.date_range:t.data_base_report} GROUP BY bucket');
  });

  it('recusa SELECT DISTINCT — a deduplicação não sobrevive ao agrupamento', () => {
    const r = kpiMonthlySeries(
      `SELECT DISTINCT {t.v} AS value FROM {t} WHERE ${pin('t')} ORDER BY {t.d} LIMIT 1`,
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motivo).toMatch(/distinct/i);
  });

  it.each([
    ['parênteses', `SELECT SUM(({t.v}) AS value FROM {t} WHERE ${pin('t')}`],
    ['aspas', `SELECT COUNTIF({t.s} = 'x) AS value FROM {t} WHERE ${pin('t')}`],
  ])('recusa SQL com %s desbalanceados em vez de adivinhar', (_name, tpl) => {
    expect(kpiMonthlySeries(tpl).ok).toBe(false);
  });
});
