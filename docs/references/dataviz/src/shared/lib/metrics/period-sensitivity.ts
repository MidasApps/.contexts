import type { Metric } from '@/shared/schemas/metric';

/**
 * O que o filtro de período pode ou não fazer com uma métrica.
 *
 * Duas perguntas diferentes, e nenhuma delas é sobre o BLOCO — são sobre o SQL
 * que alimenta o bloco. Dois KPIs lado a lado, do mesmo tamanho e com a mesma
 * cara, podem responder de formas opostas ao mesmo filtro, e hoje nada na tela
 * distingue os dois.
 *
 * 1. **A métrica reage ao período — e a QUAL parte dele?** São duas coisas.
 *    `{filter.date_range:...}` recorta início E fim (14 das 66). As outras 45
 *    vêm de `snapshotKpi()`/`pinClause()`, que fixam
 *    `data_base_report = (SELECT MAX(...) WHERE {filter.ate})`: o `MAX` é
 *    calculado DENTRO da faixa, então elas seguem o FIM do período. Escolher
 *    maio devolve o número de maio. Só 7 não têm cláusula de data nenhuma.
 *
 *    ⚠️ A frase que estava aqui — "nenhum filtro do app alcança esse pin" —
 *    descrevia o pin ANTES de `patch-covenants-snapshot-pin.mjs`, que já rodou.
 *    Ela sobreviveu à migração e induziu a leitura de que 60 dos 91 blocos do
 *    Vila Rosa eram inertes ao período. São 12, e por outro motivo.
 *
 * 2. **A métrica é uma série?** Importa para o modo "Último mês": recortar uma
 *    série a um mês só a transforma num ponto, e um gráfico de linha com um
 *    ponto não é uma leitura mais focada — é um gráfico quebrado. O modo fala
 *    do NÚMERO (a posição do último mês contra o acumulado do período); a
 *    série sempre percorre o período inteiro.
 */

/** As formas em que o eixo do tempo É o dado. */
const SERIES_SHAPES = new Set(['timeseries', 'timeseries_multi', 'timeseries_pivot']);

/**
 * Os dois placeholders de período, com a fronteira do nome.
 *
 * A chave de `{filter.X}` é livre — o template a declara em
 * `metricPageFilters`. Comparar por prefixo (`includes('{filter.ate')`) fazia
 * `{filter.atendimento}` passar por pin de período: o bloco receberia o selo de
 * variação com as duas consultas devolvendo o mesmo número, que é o "0,0% sem
 * comparação" que estas funções existem para impedir. O placeholder termina em
 * `:` (coluna explícita) ou `}`.
 */
const TRIMS_RANGE = /\{filter\.date_range[:}]/;
const TRIMS_END = /\{filter\.ate[:}]/;

/**
 * Como a métrica trata a data — e são TRÊS casos, não dois.
 *
 * - `periodo`: declara `{filter.date_range}` e obedece à faixa inteira (14 de 66).
 * - `posicao`: fixa `data_base_report = MAX(...)` no próprio SQL (45). Mostra
 *   UM mês — o último dentro do período escolhido, não o último do dataset.
 * - `historico`: não tem cláusula de data nenhuma (7). Mostra TUDO, de
 *   abril a julho, independentemente do que se escolha.
 *
 * A distinção não é preciosismo: a mensagem que o bloco exibe muda. Dizer
 * "posição em jul/26" num gráfico que está mostrando abril, maio, junho e
 * julho é uma afirmação falsa sobre o que está na tela — e foi exatamente o
 * que a primeira versão desta nota fez com o empilhado de faixas de atraso e
 * com o "Entradas & Saídas".
 */
export type RegimeDeData = 'periodo' | 'posicao' | 'historico';

/** O pin, nas duas formas em que ele é escrito: `= (SELECT MAX(…))` ou `IN`. */
const PIN_DE_SNAPSHOT = /data_base_report[^)]*\b(?:=|IN)\s*\(\s*SELECT\s+MAX/i;

/**
 * `MAX()` sobre a COLUNA DE SNAPSHOT — rede para pins escritos de outro jeito.
 *
 * A peneira anterior era `/MAX\(/`: qualquer agregação bastava. Uma métrica
 * como `SELECT MAX({t.valor_contrato}) AS value FROM {t}`, sem cláusula de data
 * nenhuma, lê a união de todos os snapshots e era classificada `posicao` —
 * ganhando a nota "posição em jul/26" embaixo de um número que não é de jul/26.
 * A função existe para não afirmar falsidade sobre o que está na tela; a
 * peneira tem de olhar a coluna, não a função de agregação.
 */
const MAX_DE_SNAPSHOT = /MAX\(\s*\{?[a-z_][a-z0-9_]*\.data_base_report/i;

export function regimeDeData(metric: Metric | undefined): RegimeDeData {
  if (!metric?.recipe) return 'historico';
  // `aggregation`/`derived` são montados pelo resolver a partir dos filtros de
  // página: o período entra por construção.
  if (metric.recipe.kind !== 'sql') return 'periodo';

  const t = metric.recipe.template;
  if (TRIMS_RANGE.test(t)) return 'periodo';
  if (PIN_DE_SNAPSHOT.test(t) || MAX_DE_SNAPSHOT.test(t)) return 'posicao';
  return 'historico';
}

/**
 * A métrica é recortada pelo filtro de período?
 *
 * Lê o template do recipe `sql` — é o mesmo texto que o resolver expande, então
 * a resposta não pode divergir do que acontece na consulta. Recipes
 * `aggregation`/`derived` são montados pelo resolver a partir dos filtros de
 * página e por isso respondem ao período por construção.
 */
export function reactsToPeriod(metric: Metric | undefined): boolean {
  if (!metric?.recipe) return false;
  if (metric.recipe.kind !== 'sql') return true;
  return TRIMS_RANGE.test(metric.recipe.template);
}

/** A métrica devolve uma série no tempo? */
export function isSeries(metric: Metric | undefined): boolean {
  return metric?.shape !== undefined && SERIES_SHAPES.has(metric.shape);
}

/**
 * O modo "Último mês" vale para ESTA métrica?
 *
 * Só para as que reagem ao período e não são série. Uma métrica fixada no
 * último mês já está no modo; uma série não deve sair dele.
 */
export function acceptsSingleMonthTrim(metric: Metric | undefined): boolean {
  return reactsToPeriod(metric) && !isSeries(metric);
}

/**
 * O bloco muda quando o usuário mexe no FIM do período?
 *
 * Pergunta distinta de `reactsToPeriod`, e a distinção é o motivo de este
 * predicado existir. Aquele responde "a faixa inteira recorta esta consulta?",
 * que é o que o modo Último mês/Todo o período precisa saber. Este responde "trocar
 * o mês final muda o número?" — e para as 45 métricas de posição a resposta é
 * sim, porque o `MAX` do pin é calculado dentro da faixa (`{filter.ate}`).
 *
 * Quem consome: a guarda de `applyComparisonToBlock`. Ela usava
 * `reactsToPeriod` e por isso descartava o selo de variação em todo KPI e todo
 * medidor do produto — exatamente os blocos que sabem desenhá-lo. A segunda
 * consulta do comparativo saía, voltava com o número de outro mês, e o
 * resultado era jogado fora.
 *
 * Pin SEM `{filter.ate}` continua fora: aí o `MAX` é o da tabela toda, as duas
 * consultas voltam idênticas e o selo afirmaria uma comparação que não houve.
 */
export function followsPeriodEnd(metric: Metric | undefined): boolean {
  if (!metric?.recipe) return false;
  if (metric.recipe.kind !== 'sql') return true;
  const t = metric.recipe.template;
  return TRIMS_RANGE.test(t) || TRIMS_END.test(t);
}
