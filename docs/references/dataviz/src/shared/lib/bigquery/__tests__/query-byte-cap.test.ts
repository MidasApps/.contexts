import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regra de custo (`.contexts/engineering/rules/cost.md`): todo caminho que
 * executa SQL passa `maximumBytesBilled`. A revisão do PR #23 achou 22 tools do
 * chat que não passavam — cada tool nova copiava a vizinha sem o teto.
 *
 * Checagem estática sobre todo o código do app: toda chamada `.query(`,
 * `createQueryJob(`, `createQueryStream(` ou `createJob(` precisa carregar
 * `maximumBytesBilled` no próprio argumento, ou ser `dryRun: true` (dry-run não
 * é faturado). Não contam: um `...opts` que esconda o teto, o teto só num dos
 * ramos de um spread condicional, `maximumBytesBilled: undefined`, nem a chave
 * dentro de um comentário.
 *
 * Revisão do PR #26 — furos fechados aqui:
 * - chamada com genérico (`.query<Row>(`), colchete (`client['query'](`) e
 *   optional chaining (`.query?.(`) não eram vistas;
 * - o método copiado para outra variável (`bind`, atribuição, desestruturação)
 *   escapava de qualquer checagem por chamada — agora é recusado;
 * - spread DEPOIS do teto (`{ maximumBytesBilled, ...opts }`) pode sobrescrevê-lo;
 * - teto vindo de variável pode ser `undefined` em runtime: o valor tem de ser
 *   `String(maxBytesBilled())`, a forma única do projeto.
 *
 * `.query` é ambíguo — `stats.query` é propriedade legítima —, então ele só é
 * acusado fora de chamada quando o objeto é um CLIENTE do BigQuery conhecido no
 * arquivo: variável atribuída de `getBigQueryClient()`/`new BigQuery(…)`,
 * tipada como `BigQuery`, ou `getBigQueryClient().query` direto. Isso cobre
 * `runWith(bq.query)`, `() => bq.query` e `x ? bq.query : …`.
 * `createQueryJob`/`createQueryStream`/`createJob`, que só existem como
 * método, são acusados em qualquer uso que não seja chamada.
 */

const ROOT = process.cwd();

/**
 * Todo o código do app: `src/` e as rotas em `app/`. A primeira versão olhava
 * só o que o chat alcança, e deixou de fora duas rotas sem teto — uma delas o
 * DISTINCT de coluna inteira que qualquer usuário dispara ao abrir um seletor.
 */
const SCANNED = ['src', 'app'];

const sourceFiles = (rel: string): string[] => {
  const abs = path.join(ROOT, rel);
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs).flatMap((name) => {
    const child = path.join(rel, name);
    if (statSync(path.join(ROOT, child)).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(child);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [child] : [];
  });
};

/** Texto entre o `(` da chamada e o `)` que o fecha. */
const argumentOf = (source: string, openParen: number): string => {
  let depth = 0;
  for (let i = openParen; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')' && --depth === 0) return source.slice(openParen + 1, i);
  }
  return source.slice(openParen + 1);
};

/** Tira comentários de TS do texto do argumento (o teto num comentário não vale). */
const stripComments = (arg: string): string => {
  // Comentário vira espaços do MESMO comprimento, com as mesmas quebras de
  // linha: índice e número de linha do que vem depois continuam os do arquivo.
  const blank = (c: string) => c.replace(/[^\n]/g, ' ');
  return arg.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
};

/**
 * Apaga o CONTEÚDO de strings e template literals (mesmo comprimento, mesmas
 * quebras de linha); o código dentro de `${…}` fica. Teto, `dryRun` ou `...`
 * dentro de texto — um SQL, uma mensagem — não são código.
 */
const blankStrings = (code: string): string => {
  const out = code.split('');
  const blank = (de: number, ate: number) => {
    for (let k = de; k < ate; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const scan = (i: number, closeAt: string | null): number => {
    let braces = 0;
    while (i < code.length) {
      const c = code[i]!;
      if (closeAt === '}' && c === '{') braces++;
      if (closeAt === '}' && c === '}') {
        if (braces === 0) return i;
        braces--;
      }
      // Literal de regex (`/'/g`): as aspas dele não abrem string. Regex só
      // começa onde uma expressão pode começar.
      if (c === '/' && code[i + 1] !== '/' && code[i + 1] !== '*' && /[(,=:[!&|?{};]\s*$|^\s*$/.test(code.slice(Math.max(0, i - 40), i).split('\n').at(-1) ?? '')) {
        let j = i + 1;
        let inCharClass = false;
        while (j < code.length && code[j] !== '\n' && (inCharClass || code[j] !== '/')) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === '[') inCharClass = true;
          else if (code[j] === ']') inCharClass = false;
          j++;
        }
        i = j + 1;
        continue;
      }
      if (c === "'" || c === '"') {
        let j = i + 1;
        while (j < code.length && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
        blank(i + 1, j);
        i = j + 1;
        continue;
      }
      if (c === '`') {
        let j = i + 1;
        let textStart = j;
        while (j < code.length && code[j] !== '`') {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === '$' && code[j + 1] === '{') {
            blank(textStart, j);
            j = scan(j + 2, '}') + 1;
            textStart = j;
            continue;
          }
          j++;
        }
        blank(textStart, j);
        i = j + 1;
        continue;
      }
      i++;
    }
    return i;
  };
  scan(0, null);
  return out.join('');
};

// O valor termina ali — depois dele só vírgula ou `}`, mesmo com quebra de
// linha no meio: `String(maxBytesBilled())\n && undefined` não é teto.
const HAS_CAP = /\bmaximumBytesBilled\s*:\s*String\(\s*maxBytesBilled\(\s*\)\s*\)(?=\s*(?:[,}]|$))/;
const HAS_DRY_RUN = /\bdryRun\s*:\s*true(?=\s*(?:[,}]|$))/;

const QUERY_METHODS = 'query|createQueryJob|createQueryStream|createJob';

/** Chamada: `.query(`, `.query<T>(`, `.query?.(`, `['query'](`, `createQueryJob(`… */
const QUERY_CALL = new RegExp(
  String.raw`(?:\.query|\[\s*['"\`](?:${QUERY_METHODS})['"\`]\s*\]|\bcreateQueryJob|\bcreateQueryStream|\bcreateJob)`
  + String.raw`\s*(?:<[^<>()]*(?:<[^<>()]*>[^<>()]*)*>)?\s*(?:\?\.)?\s*\(`,
  'g',
);

/**
 * `true` se o argumento tem teto em TODO caminho.
 *
 * - `dryRun: true` à vista (fora de spread), sem spread depois dele: dry-run
 *   não é faturado.
 * - Senão, o teto à vista, ou num spread condicional com teto nos DOIS ramos.
 * - Qualquer spread DEPOIS do teto derruba: pode trazer
 *   `maximumBytesBilled: undefined` e vencer. Exceção: um condicional que
 *   repõe o teto nos dois ramos.
 * Strings e comentários não contam (`semStrings`, `semComentarios`).
 */
const isArgumentCapped = (arg: string): boolean => {
  const text = blankStrings(stripComments(arg));
  // Troca cada `...( … )` por um marcador, guardando se ele repõe o teto.
  let visible = text;
  const conditionals: boolean[] = [];
  for (let i = visible.indexOf('...('); i !== -1; i = visible.indexOf('...(')) {
    const inner = argumentOf(visible, i + 3);
    conditionals.push(HAS_CAP.test(inner) && bothBranchesCapped(inner));
    visible = `${visible.slice(0, i)} \u0000${conditionals.length - 1}\u0000 ${visible.slice(i + 3 + inner.length + 2)}`;
  }
  /** Depois de `desde`: há spread que pode sobrescrever o teto? */
  const hasSpreadAfter = (from: number): boolean => {
    const rest = visible.slice(from);
    if (/\.\.\./.test(rest)) return true;
    return [...rest.matchAll(/\u0000(\d+)\u0000/g)].some((m) => !conditionals[Number(m[1])]);
  };

  // Só vale no nível de cima do objeto literal que É o PRIMEIRO argumento:
  // dentro de `params: { … }`, de `Object.assign({ … }, opts)` ou num segundo
  // argumento (callback, opções de resultado) não é opção do job.
  if (!/^\s*\{/.test(visible)) return false;
  visible = visible.slice(0, firstObjectEnd(visible));
  const topLevelIndex = (re: RegExp): number => {
    for (const m of visible.matchAll(new RegExp(re.source, 'g'))) {
      if (depthAt(visible, m.index!) === 1) return m.index!;
    }
    return -1;
  };

  const dryRunIndex = topLevelIndex(HAS_DRY_RUN);
  if (dryRunIndex !== -1 && !hasSpreadAfter(dryRunIndex)) return true;

  const capIndex = topLevelIndex(HAS_CAP);
  if (capIndex !== -1) return !hasSpreadAfter(capIndex);
  // Sem teto à vista: vale o último condicional NO NÍVEL DE CIMA que o repõe,
  // sem spread depois.
  const markers = [...visible.matchAll(/\u0000(\d+)\u0000/g)]
    .filter((m) => conditionals[Number(m[1])] && depthAt(visible, m.index!) === 1);
  const lastMarker = markers.at(-1);
  return lastMarker !== undefined && !hasSpreadAfter(lastMarker.index! + lastMarker[0].length);
};

/** Profundidade de `{`/`(`/`[` abertos antes de `pos`. */
const depthAt = (text: string, pos: number): number => {
  let depth = 0;
  for (let k = 0; k < pos; k++) {
    const c = text[k]!;
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
  }
  return depth;
};

/** Fim (exclusivo) do primeiro objeto `{…}` do texto — o primeiro argumento. */
const firstObjectEnd = (text: string): number => {
  const openIndex = text.indexOf('{');
  let depth = 0;
  for (let k = openIndex; k < text.length; k++) {
    const c = text[k]!;
    if (c === '{' || c === '(' || c === '[') depth++;
    else if ((c === '}' || c === ')' || c === ']') && --depth === 0) return k + 1;
  }
  return text.length;
};

/**
 * O método de query tirado do objeto para outra variável — `bind`, atribuição
 * ou desestruturação — é chamado depois sem nenhum dos nomes que a checagem por
 * chamada procura. Só nos arquivos que falam com o BigQuery: `.query` é nome
 * comum (`url.query`, `stats.query`).
 */
const methodAliases = (file: string, source: string): string[] => {
  if (!/@google-cloud\/bigquery|getBigQueryClient|lib\/bigquery\/client/.test(source)) return [];
  const code = stripComments(source);
  const lineOf = (i: number) => `${file}:${code.slice(0, i).split('\n').length}`;
  const findings: string[] = [];
  const codeOnly = blankStrings(code);
  // Nomes que só existem como MÉTODO do cliente: qualquer referência que não
  // seja chamada é o método solto (`runWith(bq.createQueryJob)`).
  const methodOnlyUse = /\.(?:createQueryJob|createQueryStream|createJob)\b(?!\s*(?:<[^<>()]*(?:<[^<>()]*>[^<>()]*)*>)?\s*(?:\?\.)?\s*\()/g;
  for (const m of codeOnly.matchAll(methodOnlyUse)) findings.push(lineOf(m.index!));
  // `.query` de um cliente do BigQuery conhecido, em qualquer uso que não seja chamada.
  const clients = new Set<string>();
  for (const m of codeOnly.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*BigQuery\b[^=]*)?=\s*(?:await\s+)?(?:getBigQueryClient\s*\(|new\s+BigQuery\s*\()/g)) clients.add(m[1]!);
  for (const m of codeOnly.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*BigQuery\b/g)) clients.add(m[1]!);
  const notACall = String.raw`(?!\s*(?:<[^<>()]*(?:<[^<>()]*>[^<>()]*)*>)?\s*(?:\?\.)?\s*\()`;
  const clientObjects = [...clients].map((c) => c.replace(/[$]/g, '\\$')).concat(String.raw`getBigQueryClient\s*\(\s*\)`);
  const clientQueryUse = new RegExp(String.raw`(?<![\w$.])(?:${clientObjects.join('|')})\s*\??\.\s*query\b${notACall}`, 'g');
  for (const m of codeOnly.matchAll(clientQueryUse)) findings.push(lineOf(m.index!));
  // Por colchete (`= bq['query']`), por `Reflect.apply(bq.query, …)` e por nome
  // dinâmico (`bq[metodo](…)`).
  const otherShapes = new RegExp(
    String.raw`=\s*[\w$.?]+\[\s*['"\`](?:${QUERY_METHODS})['"\`]\s*\]\s*(?=[;,)\n]|$)`
    + String.raw`|\bReflect\s*\.\s*apply\s*\(\s*[\w$.?]+\.(?:${QUERY_METHODS})\b`
    + String.raw`|\bReflect\s*\.\s*get\s*\(\s*[\w$.?]+\s*,\s*['"\`](?:${QUERY_METHODS})['"\`]`
    + String.raw`|\[\s*['"\`](?:${QUERY_METHODS})['"\`]\s*\]\s*\.\s*(?:bind|call|apply)\b`
    // Como elemento de array ou valor de objeto: `[bq.query]`, `{ run: bq.query }`.
    + String.raw`|[[:]\s*[\w$.?]+\.(?:${QUERY_METHODS})\s*(?=[,\]}])`,
    'gm',
  );
  for (const m of code.matchAll(otherShapes)) findings.push(lineOf(m.index!));
  for (const m of codeOnly.matchAll(/[\w$)\]]\s*\[\s*[A-Za-z_$][\w$]*\s*\]\s*\(/g)) findings.push(lineOf(m.index!));
  // `x = algo.query;` e `algo.query.bind(…)`: o método solto, mesmo quando o
  // cliente veio de parâmetro sem tipo. Rígida de propósito — num arquivo de
  // BigQuery, `const r = req.query` também é acusado; renomeie. Não conta a
  // leitura de propriedade passada adiante (`referencesOutsideScope(stats.query, …)`).
  const detachedMethod = new RegExp(
    String.raw`=\s*[\w$.?[\]'"]+\.(?:${QUERY_METHODS})\s*(?=[;,)\n]|$)|\.(?:${QUERY_METHODS})\s*\.\s*(?:bind|call|apply)\b`,
    'gm',
  );
  for (const m of code.matchAll(detachedMethod)) findings.push(lineOf(m.index!));
  const destructuring = new RegExp(String.raw`\{[^{}]*\b(?:${QUERY_METHODS})\b[^{}]*\}\s*=(?!=)`, 'g');
  for (const m of code.matchAll(destructuring)) findings.push(lineOf(m.index!));
  return [...new Set(findings)];
};

/** `c ? A : B` — o teto precisa estar em A e em B. */
const bothBranchesCapped = (conditional: string): boolean => {
  const q = conditional.indexOf('?');
  if (q === -1) return false;
  const rest = conditional.slice(q + 1);
  let depth = 0;
  for (let j = 0; j < rest.length; j++) {
    const c = rest[j];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ':' && depth === 0) return HAS_CAP.test(rest.slice(0, j)) && HAS_CAP.test(rest.slice(j + 1));
  }
  return false;
};

interface Call {
  site: string;
  capped: boolean;
}

const queryCalls = (file: string): Call[] => {
  const source = stripComments(readFileSync(path.join(ROOT, file), 'utf8'));
  // Mesmo comprimento: o argumento sai do texto sem strings, com os parênteses
  // de dentro de SQL fora da contagem.
  const codeOnly = blankStrings(source);
  return [...source.matchAll(QUERY_CALL)].map((m) => {
    const arg = argumentOf(codeOnly, m.index! + m[0].length - 1);
    const line = source.slice(0, m.index).split('\n').length;
    return {
      site: `${file}:${line}`,
      capped: isArgumentCapped(arg),
    };
  });
};

const files = SCANNED.flatMap(sourceFiles);
const calls = files.flatMap(queryCalls);
const aliases = files.flatMap((f) => methodAliases(f, readFileSync(path.join(ROOT, f), 'utf8')));

describe('isArgumentCapped', () => {
  it.each([
    ['teto à vista', '{ query: sql, maximumBytesBilled: String(maxBytesBilled()) }'],
    ['dry-run', '{ query: sql, dryRun: true }'],
    ['condicional com teto nos dois ramos', '{ query, ...(x ? { maximumBytesBilled: String(maxBytesBilled()) } : { maximumBytesBilled: String(maxBytesBilled()) }) }'],
    ['spread ANTES do teto', '{ ...opts, query, maximumBytesBilled: String(maxBytesBilled()) }'],
    ['teto com quebra de linha antes da vírgula', '{\n  query,\n  maximumBytesBilled: String(maxBytesBilled())\n}'],
    ['reticências dentro do SQL', "{ query: `SELECT 'a...b' AS x`, maximumBytesBilled: String(maxBytesBilled()) }"],
    ['condicional que repõe o teto depois dele', '{ query, maximumBytesBilled: String(maxBytesBilled()), ...(x ? { maximumBytesBilled: String(maxBytesBilled()) } : { maximumBytesBilled: String(maxBytesBilled()) }) }'],
    ['condicional sem teto e teto à vista', '{ query, ...(x ? { params } : {}), maximumBytesBilled: String(maxBytesBilled()) }'],
  ])('capped: %s', (_n, arg) => expect(isArgumentCapped(arg)).toBe(true));

  it.each([
    ['sem teto', '{ query: sql }'],
    ['spread de opts', '{ ...opts, query: sql }'],
    ['teto só num ramo do condicional', '{ query, ...(distinctField ? { maximumBytesBilled: String(maxBytesBilled()) } : {}) }'],
    ['teto undefined', '{ query, maximumBytesBilled: undefined }'],
    ['teto num comentário', '{ query, /* maximumBytesBilled: String(x) */ }'],
    ['teto em comentário de linha', '{ query,\n // maximumBytesBilled: String(x)\n }'],
    ['spread depois do teto', '{ query, maximumBytesBilled: String(maxBytesBilled()), ...opts }'],
    ['teto em variável', '{ query, maximumBytesBilled: teto }'],
    ['teto de outra função', '{ query, maximumBytesBilled: String(outroTeto()) }'],
    // Revisão de segurança:
    ['condicional depois do teto que o anula', '{ query, maximumBytesBilled: String(maxBytesBilled()), ...(x ? { maximumBytesBilled: undefined } : {}) }'],
    ['spread entre parênteses depois do teto', '{ query, maximumBytesBilled: String(maxBytesBilled()), ...(opts) }'],
    ['dry-run com spread depois', '{ query, dryRun: true, ...opts }'],
    ['dry-run só num ramo', '{ query, ...(x ? { dryRun: true } : {}) }'],
    ['teto dentro de string', "{ query: 'maximumBytesBilled: String(maxBytesBilled())' }"],
    ['dry-run dentro de template', '{ query: `dryRun: true` }'],
    // Revisão de segurança, rodada 2:
    ['teto em objeto aninhado', '{ query, params: { maximumBytesBilled: String(maxBytesBilled()) } }'],
    ['dry-run em objeto aninhado', '{ query, labels: { dryRun: true } }'],
    ['teto anulado na mesma expressão', '{ query, maximumBytesBilled: String(maxBytesBilled()) && undefined }'],
    ['Object.assign com opts depois', 'Object.assign({ query, maximumBytesBilled: String(maxBytesBilled()) }, opts)'],
    // Revisão de segurança, rodada 3:
    ['teto só no segundo argumento', '{ query }, { maximumBytesBilled: String(maxBytesBilled()) }'],
    ['dry-run só no segundo argumento', '{ query }, { dryRun: true }'],
    ['teto anulado na linha seguinte', '{ query, maximumBytesBilled: String(maxBytesBilled())\n && undefined }'],
    ['dry-run anulado na mesma expressão', '{ query, dryRun: true && false }'],
    ['condicional com teto aninhado', '{ query, params: { ...(x ? { maximumBytesBilled: String(maxBytesBilled()) } : { maximumBytesBilled: String(maxBytesBilled()) }) } }'],
  ])('not capped: %s', (_n, arg) => expect(isArgumentCapped(arg)).toBe(false));
});

describe('detecção das chamadas', () => {
  const countCalls = (src: string) => [...src.matchAll(QUERY_CALL)].length;

  it.each([
    ['com genérico', 'bq.query<Row>({ query })'],
    ['com genérico aninhado', 'bq.query<Array<Row>>({ query })'],
    ['com colchete', "bq['query']({ query })"],
    ['com optional chaining', 'bq.query?.({ query })'],
    ['createQueryJob com colchete', 'bq["createQueryJob"]({ query })'],
  ])('finds a call %s', (_n, src) => expect(countCalls(src)).toBe(1));

  it.each([
    ['bind', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst run = bq.query.bind(bq);"],
    ['atribuição', "import { BigQuery } from '@google-cloud/bigquery';\nconst run = bq.createQueryJob;"],
    ['desestruturação', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst { query } = getBigQueryClient();"],
    ['colchete', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst run = bq['query'];"],
    ['Reflect.apply', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nReflect.apply(bq.query, bq, [opts]);"],
    ['passado como argumento', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nrunWith(bq.createQueryJob);"],
    ['nome dinâmico', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nbq[metodo](opts);"],
    ['Reflect.get', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst run = Reflect.get(bq, 'query');"],
    ['colchete com bind', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst run = bq['query'].bind(bq);"],
    ['elemento de array', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst fns = [bq.query];"],
    ['valor de objeto', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst api = { run: bq.query };"],
    ['query de cliente passado como argumento', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst bq = getBigQueryClient();\nrunWith(bq.query);"],
    ['query de cliente devolvido por arrow', "import { BigQuery } from '@google-cloud/bigquery';\nconst client = new BigQuery();\nconst f = () => client.query;"],
    ['query de cliente em ternário', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst bq = getBigQueryClient();\nconst f = x ? bq.query : null;"],
    ['query de parâmetro tipado', "import { BigQuery } from '@google-cloud/bigquery';\nfunction f(bq: BigQuery) { return register(bq.query); }"],
    ['query do cliente direto', "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nuse(getBigQueryClient().query);"],
  ])('refuses the method taken out by %s', (_n, src) => {
    expect(methodAliases('x.ts', src)).toHaveLength(1);
  });

  it('does not flag a call or a non-client .query', () => {
    const src = "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst bq = getBigQueryClient();\nawait bq.query({ q });\nawait bq.query<Row>({ q });\nreferencesOutsideScope(stats.query, x);\nuse(req.query);";
    expect(methodAliases('x.ts', src)).toEqual([]);
  });

  it('keeps property reads such as stats.query?.statementType', () => {
    const src = "import { getBigQueryClient } from '@/shared/lib/bigquery/client';\nconst t = stats.query?.statementType; const q = url.query.x;";
    expect(methodAliases('x.ts', src)).toEqual([]);
  });
});

describe('byte cap on every BigQuery job in the app', () => {
  it('finds the query sites it is meant to guard', () => {
    expect(calls.length).toBeGreaterThan(40);
  });

  it('every .query( / createQueryJob( passes maximumBytesBilled or is a dry run', () => {
    expect(calls.filter((c) => !c.capped).map((c) => c.site)).toEqual([]);
  });

  it('no BigQuery query method is taken out of its client', () => {
    expect(aliases).toEqual([]);
  });
});
