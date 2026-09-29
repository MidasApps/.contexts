import { guardGeneratedSql, normalizeSql } from '@/features/ai-agents/lib/sql-guard';

/**
 * Guarda do TEMPLATE de uma métrica criada pela IA.
 *
 * São duas exigências, e a segunda não existe em nenhum outro caminho de SQL do
 * projeto:
 *
 * 1. **Somente leitura** — delegado a `guardGeneratedSql`, a fonte única do
 *    projeto (normaliza comentário e literal antes da denylist, recusa comando
 *    múltiplo e tudo que escreve ou exporta).
 *
 * 2. **Nenhuma tabela literal.** O template de métrica é resolvido contra o
 *    binding do cliente: `{entidade}` vira a tabela qualificada daquele tenant e
 *    `{entidade.atributo}` vira a coluna física daquele schema. Um
 *    `FROM \`projeto.dataset.tabela\`` escrito à mão passa por fora disso — o
 *    documento fica preso a um dataset, e um doc de métrica que nomeia dataset é
 *    um endereço de leitura que ninguém revisou. `execute_sql` do sub-agente não
 *    tem esse problema porque é efêmero e roda dentro do dataset já autorizado;
 *    métrica FICA, e é executada depois por quem abrir a página.
 *
 * O catálogo `covenants.*` tem exceções a (2) — duas tabelas auxiliares
 * literais, decisão registrada no seed. É decisão de administração, tomada uma
 * vez e revisada por gente; não vale para o que a conversa cria.
 */

export type GuardResult = { ok: true } | { ok: false; error: string };

/**
 * `FROM`/`JOIN`/`TABLE` seguido do alvo: `{placeholder}`, `(subquery`, crase
 * ou identificador. Sem exigir espaço: `FROM\`p.d.t\`` colado é SQL válido.
 */
const TABLE_TARGET = /\b(?:FROM|JOIN|TABLE)(?:\s+|(?=[`({]))(\{|\(|`|[A-Za-z_][A-Za-z0-9_.$-]*)/gi;

/** O alvo logo depois de uma vírgula: mesma forma de `TABLE_TARGET`. */
const TARGET_AFTER_COMMA = /^\s*(\{|\(|`|[A-Za-z_][A-Za-z0-9_.$-]*)/;

/** Palavra que encerra a cláusula FROM no nível em que ela começou. */
const FROM_CLAUSE_END = /^(?:WHERE|GROUP|HAVING|QUALIFY|WINDOW|ORDER|LIMIT|UNION|INTERSECT|EXCEPT|SELECT)\b/i;

const RESERVED_WORDS = /^(?:AS|ON|USING|WHERE|GROUP|ORDER|LIMIT|JOIN|LEFT|RIGHT|INNER|FULL|CROSS|UNION|WINDOW|QUALIFY|HAVING)$/i;

type CommaTarget = { target: string; aliases: Set<string> };

/**
 * `FROM` que não abre cláusula de tabela: `EXTRACT(MONTH FROM data)` e
 * `a IS [NOT] DISTINCT FROM b`. Tratado como tabela, `FROM c.{…}` dentro do
 * EXTRACT recusava template legítimo.
 */
const isExpressionFrom = (normalized: string, fromIndex: number): boolean => {
  const before = normalized.slice(Math.max(0, fromIndex - 80), fromIndex);
  return /\bEXTRACT\s*\(\s*[A-Za-z_]+(?:\s*\(\s*[A-Za-z_]+\s*\))?\s+$/i.test(before)
    || /\bDISTINCT\s+$/i.test(before);
};

/**
 * Alias declarado sobre um placeholder NESTA cláusula FROM, antes da vírgula e
 * no nível dela: `{contratos} c`, `{contratos} AS c`. `, c.parcelas` depois
 * dele é o array da própria linha (join correlacionado), não uma tabela.
 *
 * Só o trecho da cláusula conta: alias de coluna no SELECT, de CTE ou de
 * subquery é de outro escopo, e `FROM x, outro.tabela` com `outro` declarado lá
 * lê a tabela `outro.tabela` de verdade.
 */
const placeholderAliases = (clause: string): Set<string> => {
  let topLevel = clause;
  // Tira o conteúdo de parênteses (subqueries, funções), de dentro para fora.
  for (let previous = ''; previous !== topLevel;) {
    previous = topLevel;
    topLevel = topLevel.replace(/\([^()]*\)/g, ' ');
  }
  const aliases = [...topLevel.matchAll(/\}\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi)]
    .map((m) => m[1]!)
    .filter((alias) => !RESERVED_WORDS.test(alias))
    .map((alias) => alias.toLowerCase());
  return new Set(aliases);
};

/** Palavra-chave que encerra a cláusula começa em `i`? */
const endsFromClause = (normalized: string, i: number): boolean =>
  /[A-Za-z]/.test(normalized[i]!)
  && /\W/.test(normalized[i - 1] ?? ' ')
  && FROM_CLAUSE_END.test(normalized.slice(i));

/** Os alvos depois de vírgula numa cláusula FROM que começa em `start`. */
const commaTargetsOfClause = (normalized: string, start: number): CommaTarget[] => {
  const targets: CommaTarget[] = [];
  let depth = 0;
  for (let i = start; i < normalized.length; i++) {
    const c = normalized[i]!;
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (--depth < 0) break;
      continue;
    }
    if (depth !== 0) continue;
    if (c === ';' || endsFromClause(normalized, i)) break;
    if (c !== ',') continue;
    const match = TARGET_AFTER_COMMA.exec(normalized.slice(i + 1));
    if (match) targets.push({ target: match[1]!, aliases: placeholderAliases(normalized.slice(start, i)) });
  }
  return targets;
};

/**
 * Os alvos depois de VÍRGULA na cláusula FROM (`FROM {a} x, outro.ds.t`): o
 * join por vírgula não tem `JOIN` para `TABLE_TARGET` achar. Só vírgula no
 * nível zero conta — a de dentro de função ou subquery não separa tabela.
 */
const commaJoinTargets = (normalized: string): CommaTarget[] =>
  [...normalized.matchAll(/\bFROM\b/gi)]
    .filter((m) => !isExpressionFrom(normalized, m.index!))
    .flatMap((m) => commaTargetsOfClause(normalized, m.index! + 4));

const literalTableRefusal = (target: string): GuardResult => ({
  ok: false,
  error:
    `A métrica não pode nomear tabela direto ("${target === '`' ? '`…`' : target}"). `
    + 'Use o placeholder da entidade — `FROM {contratos}` — que o app resolve para a '
    + 'tabela do cliente, e `{contratos.saldo_devedor}` para as colunas. '
    + 'Chame list_metric_fields para ver as entidades e atributos disponíveis.',
});

export const guardMetricTemplate = (template: string): GuardResult => {
  const readCheck = guardGeneratedSql(template);
  if (!readCheck.ok) return readCheck;

  // Varre o texto NORMALIZADO: comentário vira espaço e literal vira `''`, então
  // um `-- FROM projeto.dataset.tabela` não gera recusa falsa e uma string com
  // ponto não é confundida com nome de tabela.
  // Espaço em volta do ponto não separa nome para o BigQuery: `outro . tabela`
  // e `outro/**/.tabela` são a tabela `outro.tabela`.
  const normalized = normalizeSql(template).replace(/\s*\.\s*/g, '.');
  for (const m of normalized.matchAll(TABLE_TARGET)) {
    const target = m[1]!;
    if (target === '{' || target === '(') continue; // placeholder ou subquery
    if (/^FROM/i.test(m[0]) && isExpressionFrom(normalized, m.index!)) continue;
    if (target === '`' || target.includes('.')) return literalTableRefusal(target);
    // Identificador simples: alias de CTE (`FROM base`) ou função (`FROM UNNEST(...)`).
  }

  for (const { target, aliases } of commaJoinTargets(normalized)) {
    if (target === '{' || target === '(') continue;
    const parts = target.split('.');
    const isRowArray = parts.length === 2 && aliases.has(parts[0]!.toLowerCase());
    if (target === '`' || (target.includes('.') && !isRowArray)) return literalTableRefusal(target);
  }

  return { ok: true };
};
