/**
 * Converte o SQL de um KPI de posição na série mensal equivalente.
 *
 * ─── Por que isto existe ───
 *
 * Todo KPI do produto mostra UM número: o do mês escolhido. O pin
 * (`snapshotKpi()`/`pinClause()`) reduz a consulta a uma linha, e o cartão não
 * tem como dizer se aquele 7,00 vinha de 12,06 dois meses atrás. O caminho de
 * render da sparkline já existe inteiro — `SingleKpiBlock` passa
 * `sparklineData`/`sparklineMonths` ao `KpiCard`, e o modal já tem o texto para
 * quando não chegam. O que nunca existiu foi a métrica de série por trás.
 *
 * Escrevê-las à mão seriam 32 traduções de SQL, cada uma uma chance de errar em
 * silêncio: curva plausível embaixo de número certo é pior que cartão sem
 * curva. Como o pin tem forma regular, a tradução é mecânica — e o que não for
 * reconhecido é RECUSADO, não adivinhado.
 *
 * ─── Por que ele varre o texto em vez de só aplicar regex ───
 *
 * Isto é cirurgia textual, não parse de SQL: o perigo não é errar e quebrar, é
 * errar e COMPILAR. A validação de `scripts/add-kpi-sparklines.ts` compara só o
 * ÚLTIMO ponto da série com o valor do cartão, então uma série cujo último
 * ponto bate e cujos anteriores mentem atravessa o portão inteiro. Um
 * `{filter.ate}` esquecido fora do pin faz exatamente isso.
 *
 * Por isso tudo o que decide a forma — onde termina a expressão do valor, onde
 * o WHERE vira cauda, quais são os conjuntos de topo — é procurado no NÍVEL DE
 * FORA (`topLevelMask`), ignorando o que está dentro de parênteses ou de
 * aspas. Um `AS value FROM {t} WHERE` dentro de literal é texto; um pin dentro
 * de subconsulta não é o pin da consulta.
 *
 * ⚠️ Isto gera o template; não prova que ele está certo. Quem migra deve
 * conferir contra o dado real que o último ponto da série bate com o valor que
 * o KPI exibe hoje (ADR-0027, decisão 3).
 */

export type KpiSeries =
  | { ok: true; template: string }
  | { ok: false; motivo: string };

/** `… AS value FROM {entidade} WHERE …` — a junta entre valor e filtro. */
const VALUE_MARKER = /\s+AS\s+value\s+FROM\s+\{([a-z_][a-z0-9_]*)\}\s+WHERE\s+/gi;

/** As funções que colapsam N linhas do mês em um ponto. */
const AGGREGATES = /\b(SUM|COUNT|COUNTIF|AVG|MIN|MAX|ANY_VALUE)\s*\(/i;

/** `{entidade.data_alguma_coisa}` — sparkline de data não é leitura, é ruído. */
const DATE_ATTRIBUTE = /\{[a-z_][a-z0-9_]*\.(data|dt)_[a-z0-9_]*\}/i;

/** O que encerra o WHERE. Nada disto sobrevive a um `AND` no meio do filtro. */
const TAIL_CLAUSE = /\b(?:GROUP\s+BY|HAVING|QUALIFY|WINDOW|ORDER\s+BY|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT)\b/gi;

/** Os conectores que separam condições de um WHERE. */
const CONNECTOR = /\s+(AND|OR)\s+/gi;

/**
 * Filtro de período que sobrou FORA do pin.
 *
 * O caso silencioso: `{filter.ate:t.data_venda}` ao lado do pin vira, na série,
 * um recorte que vale a faixa inteira em TODOS os meses. O último ponto bate
 * com o cartão — e passa na validação — enquanto cada ponto anterior conta
 * eventos que naquele mês ainda não tinham acontecido.
 */
const RESIDUAL_DATE_FILTER =
  /\{filter\.(?:date_range|ate|de|desde|snapshot)\b|\{filter\.[a-z_][a-z0-9_]*:[a-z_][a-z0-9_]*\.(?:data|dt)_/i;

/** O pin de posição da entidade, como `pinClause()` o escreve. */
function pinSource(entity: string): string {
  const e = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `\\{${e}\\.data_base_report\\}\\s*=\\s*\\(\\s*SELECT\\s+MAX\\(\\{${e}\\.data_base_report\\}\\)`
    + `\\s*FROM\\s*\\{${e}\\}\\s*WHERE\\s*\\{filter\\.ate:${e}\\.data_base_report\\}\\s*\\)`;
}

/**
 * Para cada índice do texto: ele está no nível de FORA?
 *
 * Fora = profundidade zero de parênteses e fora de qualquer literal. É o que
 * separa estrutura de conteúdo — sem isso, `'x AS value FROM {t} WHERE 1=1'`
 * dentro de um `COUNTIF` parte o SQL no lugar errado.
 *
 * @returns `null` quando parênteses ou aspas não fecham. Aí não há leitura
 *   confiável nenhuma, e recusar é a única resposta honesta.
 */
function topLevelMask(sql: string): boolean[] | null {
  const topLevel = new Array<boolean>(sql.length).fill(false);
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote !== null) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') { depth++; continue; }
    if (c === ')') { if (--depth < 0) return null; continue; }
    topLevel[i] = depth === 0;
  }
  return depth === 0 && quote === null ? topLevel : null;
}

/** As ocorrências de `re` que caem no nível de fora — as outras são conteúdo. */
function topLevelMatches(sql: string, re: RegExp, topLevel: boolean[]): RegExpExecArray[] {
  const search = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = search.exec(sql)) !== null) {
    if (topLevel[m.index]) matches.push(m);
  }
  return matches;
}

type Failure = { motivo: string };
type Header = { expr: string; entity: string; where: string };

/** Parte o SQL nos três pedaços que a conversão precisa. */
function readHeader(t: string): Header | Failure {
  if (!/^SELECT\s/i.test(t)) {
    return { motivo: 'forma não reconhecida: não é `SELECT <expr> AS value FROM {entidade} WHERE …`' };
  }
  const topLevel = topLevelMask(t);
  if (!topLevel) return { motivo: 'parênteses ou aspas não fecham — não dá para ler o SQL' };

  const markers = topLevelMatches(t, VALUE_MARKER, topLevel);
  if (markers.length === 0) {
    return { motivo: 'forma não reconhecida: não é `SELECT <expr> AS value FROM {entidade} WHERE …`' };
  }
  if (markers.length > 1) {
    return { motivo: 'mais de um `AS value FROM … WHERE` no nível de fora — não sei qual é a consulta' };
  }
  const m = markers[0];
  return {
    expr: t.slice('SELECT'.length, m.index).trim(),
    entity: m[1],
    where: t.slice(m.index + m[0].length).trim(),
  };
}

/** O motivo de não converter esta expressão de valor, ou `null` se serve. */
function expressionRefusal(expr: string): string | null {
  if (/^DISTINCT\b/i.test(expr)) {
    return 'SELECT DISTINCT: a deduplicação do KPI não sobrevive ao agrupamento por mês';
  }
  if (/\bSELECT\b/i.test(expr)) {
    // Subconsulta no valor carrega o pin dela junto: ficaria presa a um mês, e
    // a curva sairia plana justamente onde deveria se mover.
    return 'a expressão do valor tem subconsulta — ela ficaria presa a um mês e a curva mentiria';
  }
  if (/\{filter\./i.test(expr)) {
    return 'a expressão do valor depende de um filtro de página — o mês do bucket e o do filtro não seriam o mesmo';
  }
  if (DATE_ATTRIBUTE.test(expr)) {
    return 'o valor do KPI é uma data; série de datas não é leitura';
  }
  return null;
}

type Body = { conditions: string; ordem: string | null };

/**
 * Separa as condições do WHERE do que vem depois delas.
 *
 * A única cauda que a conversão sabe reproduzir por mês é
 * `ORDER BY … LIMIT 1` — a regra de "última linha", que vira `QUALIFY`
 * particionado. Qualquer outra (`GROUP BY` próprio, `HAVING`, `UNION`) é
 * recusada: antes ela era tratada como condição e ia parar colada num `AND`.
 */
function splitTail(where: string): Body | Failure {
  const topLevel = topLevelMask(where);
  if (!topLevel) return { motivo: 'parênteses ou aspas não fecham — não dá para ler o SQL' };

  const matches = topLevelMatches(where, TAIL_CLAUSE, topLevel);
  if (matches.length === 0) return { conditions: where, ordem: null };

  const keyword = (m: RegExpExecArray) => m[0].replace(/\s+/g, ' ').toUpperCase();
  const endOf = (m: RegExpExecArray) => m.index + m[0].length;
  const lastLine = matches.length === 2
    && keyword(matches[0]) === 'ORDER BY'
    && keyword(matches[1]) === 'LIMIT'
    && where.slice(endOf(matches[1])).trim() === '1';
  if (!lastLine) {
    return { motivo: `cláusula \`${keyword(matches[0])}\` que a conversão não sabe reproduzir por mês` };
  }
  const ordem = where.slice(endOf(matches[0]), matches[1].index).trim();
  if (!ordem) return { motivo: '`ORDER BY` sem expressão de ordenação' };
  return { conditions: where.slice(0, matches[0].index).trim(), ordem };
}

/** As condições do WHERE, quebradas nos conectores do nível de fora. */
function topLevelTerms(conditions: string, topLevel: boolean[]): { terms: string[]; connectors: string[] } {
  const terms: string[] = [];
  const connectors: string[] = [];
  let start = 0;
  for (const m of topLevelMatches(conditions, CONNECTOR, topLevel)) {
    terms.push(conditions.slice(start, m.index).trim());
    connectors.push(m[1].toUpperCase());
    start = m.index + m[0].length;
  }
  terms.push(conditions.slice(start).trim());
  return { terms, connectors };
}

/**
 * Tira o pin da cadeia de condições e devolve o que sobra.
 *
 * O pin tem de ser um conjunto INTEIRO do nível de fora. Dentro de subconsulta
 * ele não pina a consulta que vira série; ligado por `OR`, removê-lo troca a
 * pergunta; repetido, a versão anterior tirava um e deixava o outro — e o que
 * sobrava era SQL válido preso a um único mês.
 */
function removePin(conditions: string, entity: string): { text: string } | Failure {
  const topLevel = topLevelMask(conditions);
  if (!topLevel) return { motivo: 'parênteses ou aspas não fecham — não dá para ler o SQL' };

  const { terms, connectors } = topLevelTerms(conditions, topLevel);
  if (connectors.includes('OR')) {
    return { motivo: 'o WHERE encadeia condições com OR no nível de fora — tirar o pin de dentro de um OR muda a pergunta' };
  }
  const source = pinSource(entity);
  const soOPin = new RegExp(`^(?:${source})$`, 'i');
  const found = terms.flatMap((term, i) => (soOPin.test(term) ? [i] : []));
  if (found.length === 0) {
    return new RegExp(source, 'i').test(conditions)
      ? { motivo: 'o pin não é condição de topo do WHERE (está em subconsulta ou entre parênteses) — a série não seria a do cartão' }
      : { motivo: 'sem o pin de posição — nada a converter' };
  }
  if (found.length > 1) {
    return { motivo: 'mais de um pin de posição no WHERE — a série ficaria presa a um deles' };
  }
  const text = terms.filter((_, i) => i !== found[0]).join(' AND ');
  if (RESIDUAL_DATE_FILTER.test(text)) {
    return { motivo: 'sobrou um filtro de data fora do pin — na série ele valeria a faixa inteira em todo mês, e só o último ponto bateria com o cartão' };
  }
  return { text };
}

/** O SQL da série, nas duas formas: agregada por mês ou última linha do mês. */
function buildSeries(p: { expr: string; entity: string; filters: string; ordem: string | null }): KpiSeries {
  const bucket = `DATE_TRUNC({${p.entity}.data_base_report}, MONTH)`;
  const head = `SELECT ${bucket} AS bucket,\n       ${p.expr} AS value\nFROM {${p.entity}}\n`
    + `WHERE {filter.date_range:${p.entity}.data_base_report}`
    + (p.filters ? `\n  AND ${p.filters}` : '');

  if (AGGREGATES.test(p.expr)) {
    if (p.ordem) {
      return { ok: false, motivo: 'agrega E recorta por LIMIT 1 — as duas regras não se combinam sozinhas' };
    }
    return { ok: true, template: `${head}\nGROUP BY bucket\nORDER BY bucket` };
  }

  /*
   * Coluna crua: o mês tem N linhas e o KPI escolhia uma por `ORDER BY … LIMIT
   * 1`. `QUALIFY` repete essa escolha dentro de cada mês. Trocar por `MAX()`
   * seria outra pergunta — o maior acumulado do mês não é a última medição.
   */
  if (!p.ordem) {
    return { ok: false, motivo: 'expressão não agrega e não há `ORDER BY … LIMIT 1` que diga qual linha do mês vale' };
  }
  return {
    ok: true,
    template: `${head}\nQUALIFY ROW_NUMBER() OVER (PARTITION BY ${bucket} ORDER BY ${p.ordem}) = 1`
      + '\nORDER BY bucket',
  };
}

/**
 * A série mensal equivalente a um KPI de posição, ou o motivo de não haver uma.
 *
 * @param template SQL do recipe `sql` da métrica, com placeholders da camada
 *   semântica (`{entidade.atributo}`, `{filter.…}`) ainda por expandir.
 */
export function kpiMonthlySeries(template: string): KpiSeries {
  const t = template.replace(/\s+/g, ' ').trim().replace(/;+$/, '').trim();

  const header = readHeader(t);
  if ('motivo' in header) return { ok: false, motivo: header.motivo };

  const recusa = expressionRefusal(header.expr);
  if (recusa) return { ok: false, motivo: recusa };

  const body = splitTail(header.where);
  if ('motivo' in body) return { ok: false, motivo: body.motivo };

  const filters = removePin(body.conditions, header.entity);
  if ('motivo' in filters) return { ok: false, motivo: filters.motivo };

  return buildSeries({
    expr: header.expr,
    entity: header.entity,
    filters: filters.text,
    ordem: body.ordem,
  });
}
