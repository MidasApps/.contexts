/**
 * O usuário estreitou o período, ou está vendo tudo o que existe?
 *
 * É a pergunta que decide se vale confessar que um bloco não seguiu o filtro.
 * Sem recorte não há divergência: todas as métricas — as que acompanham o
 * período e as fixadas no último mês — descrevem o mesmo intervalo, e uma nota
 * em 52 dos 64 blocos seria ruído que ninguém lê, inclusive quando importa.
 *
 * `dataBaseOptions` chega em ordem decrescente (a primeira é a mais recente),
 * que é como o painel de filtros já a consome para min/max.
 */
export function isPeriodTrimmed(
  dateRange: { start: string; end: string } | undefined,
  dataBaseOptions: ReadonlyArray<{ value: string }> | undefined,
): boolean {
  // Ausente e vazio são a MESMA situação: sem as datas do dataset não há como
  // saber o que é a faixa inteira, e afirmar recorte aí acenderia a nota em
  // toda a página no primeiro paint.
  if (!dataBaseOptions?.length) return false;
  if (!dateRange?.start || !dateRange.end) return false;
  const latest = dataBaseOptions[0]?.value;
  const earliest = dataBaseOptions[dataBaseOptions.length - 1]?.value;
  return dateRange.start !== earliest || dateRange.end !== latest;
}

/**
 * A data que uma métrica de posição de fato descreve.
 *
 * Não é o `MAX` do dataset. O pin dela é
 * `data_base_report = (SELECT MAX(...) WHERE data_base_report <= {ate})`, e o
 * `ate` é o FIM DO PERÍODO — então o mês exibido é a última medição dentro da
 * faixa escolhida. Esta função repete essa conta sobre as opções conhecidas,
 * porque o rótulo tem de dizer o mesmo que a consulta.
 *
 * A versão anterior devolvia sempre `dataBaseOptions[0]`, sob a crença de que o
 * pin ignorava o filtro. Com jul/26 no dataset e o período terminando em jun/26,
 * a nota anunciava julho embaixo do número de junho — a afirmação falsa que ela
 * existe para evitar.
 *
 * @param periodEnd Fim da faixa escolhida. Ausente = a faixa é tudo o que
 *   existe, e vale a medição mais recente.
 */
export function positionMonth(
  dataBaseOptions: ReadonlyArray<{ value: string }> | undefined,
  periodEnd?: string,
): string | null {
  if (!dataBaseOptions?.length) return null;
  if (!periodEnd) return dataBaseOptions[0]?.value ?? null;
  // Ordem decrescente: a primeira que couber no período é a mais recente dele.
  return dataBaseOptions.find((o) => o.value <= periodEnd)?.value ?? null;
}
