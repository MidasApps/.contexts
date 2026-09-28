import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';

/**
 * As peças compartilhadas pelas ferramentas de filtro de página.
 *
 * Desde a ADR-0026 o vocabulário é o do INDICADOR: quem oferece filtro é a
 * métrica, declarando em `filterFields` o que compara e qual coluna do
 * resultado mostra aquele valor. Antes disso a ferramenta trabalhava com
 * `entidade.atributo` — vocabulário em que "BANCO INTER" não existe, porque o
 * nome nasce de um JOIN da própria métrica.
 */

/** Uma métrica com template SQL inspecionável. */
interface MetricWithTemplate {
  template: string | null;
  filterFields: Record<string, { expr?: string; field?: string; label?: string }>;
}

function pageMetrics(
  sc: ClientSemanticContext | undefined,
  blockMap: Record<string, unknown> | undefined,
): Array<{ id: string } & MetricWithTemplate> {
  const ids = new Set<string>();
  for (const block of Object.values(blockMap ?? {})) {
    const b = block as { metricId?: unknown };
    if (typeof b?.metricId === 'string') ids.add(b.metricId);
  }

  const output: Array<{ id: string } & MetricWithTemplate> = [];
  for (const id of ids) {
    const metric = sc?.metrics.find((m) => m.id === id) as
      | { recipe?: { kind?: string; template?: string }; filterFields?: MetricWithTemplate['filterFields'] }
      | undefined;
    if (!metric) continue;
    const recipe = metric.recipe;
    output.push({
      id,
      // Sem template não dá para afirmar nada: `aggregation`/`derived` são
      // montadas pelo resolver, que aplica os filtros por construção.
      template: recipe?.kind === 'sql' && typeof recipe.template === 'string' ? recipe.template : null,
      filterFields: metric.filterFields ?? {},
    });
  }
  return output;
}

/** Um campo de indicador que a página pode transformar em seletor. */
export interface FilterableField {
  /** Coluna do resultado — o que o usuário vê na tela. */
  campo: string;
  /** Chave do filtro: o `X` de `{filter.X}` que a métrica cita. */
  chave: string;
  /** Métrica que alimenta o seletor. */
  metricId: string;
  /** Rótulo sugerido pela métrica. */
  label?: string;
  /** A página já declarou esta chave? */
  jaDeclarado: boolean;
}

/**
 * Os campos filtráveis dos indicadores DESTA página.
 *
 * É a lista curta que o assistente precisa ver para escolher — em vez do
 * contrato do cliente inteiro, com mais de cem atributos dos quais a maioria
 * não aparece em indicador nenhum. Foi assim que `transacoes.pagador_banco`
 * (NULL em 418 de 418 linhas) virou o "filtro de banco" de uma tela que mostra
 * "BANCO INTER".
 *
 * Só entram declarações com `field`: sem coluna no resultado não há de onde
 * tirar as opções do seletor — a declaração serve para a métrica OBEDECER ao
 * filtro, não para alimentá-lo.
 */
export function pageFilterableFields(
  sc: ClientSemanticContext | undefined,
  blockMap: Record<string, unknown> | undefined,
  declared: string[],
): FilterableField[] {
  const alreadyDeclared = new Set(declared);
  const byField = new Map<string, FilterableField>();

  for (const metric of pageMetrics(sc, blockMap)) {
    for (const [key, decl] of Object.entries(metric.filterFields)) {
      if (!decl?.field) continue;
      // Duas métricas podem declarar o mesmo campo; a primeira alimenta o
      // seletor, e as demais apenas obedecem — o alcance sai em `metricsHonoringKey`.
      if (byField.has(decl.field)) continue;
      byField.set(decl.field, {
        campo: decl.field,
        chave: key,
        metricId: metric.id,
        label: decl.label,
        jaDeclarado: alreadyDeclared.has(key),
      });
    }
  }
  return [...byField.values()].sort((a, b) => a.campo.localeCompare(b.campo));
}

/**
 * O alcance do filtro entre os indicadores da página, em três grupos.
 *
 * Declarar o filtro não recorta nada — a métrica precisa citá-lo no template E
 * saber com o que comparar. Sem esta conferência a ferramenta anunciaria
 * sucesso e o usuário ganharia um seletor decorativo, que é o defeito que a
 * ADR-0025 tirou do painel.
 *
 * - `honram`: cita `{filter.chave}` e sabe comparar (pin no template ou
 *   `filterFields[chave]`);
 * - `withoutComparison`: cita e NÃO sabe comparar — o placeholder vira `1=1` e a
 *   métrica ignora a seleção em silêncio;
 * - `ignoram`: não cita a chave.
 */
export function metricsHonoringKey(
  sc: ClientSemanticContext | undefined,
  blockMap: Record<string, unknown> | undefined,
  key: string,
): { honoring: string[]; ignoring: string[]; withoutComparison: string[] } {
  const honoring: string[] = [];
  const ignoring: string[] = [];
  const withoutComparison: string[] = [];

  // Escapes DUPLOS: dentro de template literal, `\{` já viraria `{` na string,
  // e a regex nasceria sem o escape que o `.` precisa.
  const cites = new RegExp(`\\{filter\\.${key}[:}]`);
  const withPin = new RegExp(`\\{filter\\.${key}:[a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_]*\\}`);

  for (const metric of pageMetrics(sc, blockMap)) {
    if (metric.template === null) continue;
    if (!cites.test(metric.template)) {
      ignoring.push(metric.id);
      continue;
    }
    const canCompare = withPin.test(metric.template) || Boolean(metric.filterFields[key]?.expr);
    (canCompare ? honoring : withoutComparison).push(metric.id);
  }
  return { honoring, ignoring, withoutComparison };
}
