import { describe, it, expect } from 'vitest';
import { guardGeneratedSql, normalizeSql } from '../sql-guard';

/** Afirma a recusa e devolve a mensagem, para os testes que checam o motivo. */
function recusa(sql: string): string {
  const r = guardGeneratedSql(sql);
  expect(r.ok, `deveria recusar: ${sql}`).toBe(false);
  return r.ok ? '' : r.error;
}
/** Versão void, para uso direto em `it.each` (que não aceita retorno). */
const rejectsEach = (sql: string): void => { recusa(sql); };

function accepts(sql: string): void {
  const r = guardGeneratedSql(sql);
  expect(r.ok, `deveria aceitar: ${sql}`).toBe(true);
}

describe('consultas legítimas continuam passando', () => {
  it.each([
    'SELECT * FROM contratos LIMIT 10',
    '  select saldo_devedor from contratos ',
    'WITH base AS (SELECT 1 AS x) SELECT x FROM base',
    'SELECT SAFE_DIVIDE(a, b) FROM contratos WHERE data_base_report = @d',
    'SELECT * FROM contratos; ',
    'SELECT * FROM `projeto.dataset.contratos`',
  ])('%s', accepts);

  // Falso positivo do guardrail antigo: a regex não separava código de string,
  // então uma consulta honesta por um valor de texto era recusada.
  it('literal que CONTÉM palavra proibida é consulta válida', () => {
    accepts("SELECT * FROM contratos WHERE observacao = 'DROP TABLE clientes'");
    accepts('SELECT * FROM contratos WHERE status = "INSERT INTO"');
  });

  it('comentário explicativo não atrapalha', () => {
    accepts('-- calcula a inadimplência\nSELECT * FROM contratos');
    accepts('SELECT /* saldo atual */ saldo_devedor FROM contratos');
  });
});

describe('escrita e alteração continuam bloqueadas', () => {
  it.each([
    'INSERT INTO contratos VALUES (1)',
    'UPDATE contratos SET x = 1',
    'DELETE FROM contratos',
    'DROP TABLE contratos',
    'ALTER TABLE contratos ADD COLUMN x INT64',
    'CREATE TABLE t AS SELECT 1',
    'TRUNCATE TABLE contratos',
    'MERGE INTO contratos USING x ON true',
  ])('%s', rejectsEach);
});

describe('furos que o guardrail antigo deixava passar', () => {
  // O padrão exigia `DROP\s+\S`. Um comentário no lugar do espaço não casa
  // com \s+ — e passava direto.
  it('comentário de bloco no lugar do espaço não burla mais', () => {
    recusa('SELECT 1 FROM t; DROP/**/TABLE contratos');
    recusa('WITH x AS (SELECT 1) SELECT 1; INSERT/**/INTO contratos VALUES (1)');
  });

  // A exfiltração mais direta do BigQuery: não é DML nem DDL, então passava
  // por todos os filtros anteriores.
  it('EXPORT DATA é recusado nas duas formas de chegada', () => {
    recusa("EXPORT DATA OPTIONS(uri='gs://bucket/*') AS SELECT * FROM contratos");
    recusa("SELECT 1; EXPORT DATA OPTIONS(uri='gs://x/*') AS SELECT * FROM contratos");
  });

  // Neutralizar literais sem recusar SQL dinâmico abriria um furo novo: o
  // comando perigoso passaria a viajar dentro de uma string.
  it('EXECUTE IMMEDIATE é recusado — senão a neutralização de literal viraria bypass', () => {
    recusa("SELECT 1; EXECUTE IMMEDIATE 'DROP TABLE contratos'");
  });

  // As formas acima são barradas por uma regra ANTERIOR (início inválido ou
  // segundo comando). Estes casos passam por essas duas e chegam à denylist,
  // provando que ela sozinha também pega — se as camadas forem reordenadas um
  // dia, a cobertura não some em silêncio.
  it('a denylist pega EXPORT DATA e EXECUTE IMMEDIATE por conta própria', () => {
    expect(recusa("WITH x AS (SELECT 1) EXPORT DATA OPTIONS(uri='gs://b/*') AS SELECT 1"))
      .toContain('EXPORT DATA');
    expect(recusa("WITH x AS (SELECT 1) EXECUTE IMMEDIATE 'DROP TABLE t'"))
      .toContain('EXECUTE IMMEDIATE');
  });

  it('segundo comando é recusado mesmo sendo inofensivo', () => {
    const error = recusa('SELECT 1; SELECT 2');
    expect(error).toContain('único comando');
  });

  it.each([
    'LOAD DATA INTO contratos FROM FILES (uris=[])',
    'CALL meu_procedimento()',
    'DECLARE x INT64',
    'GRANT `roles/viewer` ON TABLE t TO "user:x@y.com"',
    'REVOKE `roles/viewer` ON TABLE t FROM "user:x@y.com"',
  ])('%s é recusado', rejectsEach);
});

describe('normalizeSql', () => {
  it('comentário vira espaço, não vazio — senão DROP/**/TABLE viraria DROPTABLE', () => {
    expect(normalizeSql('DROP/**/TABLE')).toBe('DROP TABLE');
  });

  it('comentário de linha nos dois formatos', () => {
    expect(normalizeSql('SELECT 1 -- nota\nFROM t').replace(/\s+/g, ' ')).toBe('SELECT 1 FROM t');
    expect(normalizeSql('SELECT 1 # nota\nFROM t').replace(/\s+/g, ' ')).toBe('SELECT 1 FROM t');
  });

  it('esvazia o literal preservando a forma da query', () => {
    expect(normalizeSql("WHERE x = 'DROP TABLE t'")).toBe("WHERE x = ''");
  });

  // Este teste afirmava que `''` era escape e que 'a''b' era UM literal. No
  // GoogleSQL não é: são dois literais vizinhos ('a' e 'b'). Tratar como escape
  // alongava o literal além do que o BigQuery alonga — divergência de léxico é
  // exatamente o que abre bypass (ver "léxico alinhado ao do BigQuery").
  it("aspa duplicada são dois literais vizinhos, como no BigQuery", () => {
    expect(normalizeSql("SELECT 'a''b' AS x")).toBe("SELECT '''' AS x");
  });

  it('barra invertida escapa a aspa', () => {
    expect(normalizeSql("SELECT 'a\\'b' AS x")).toBe("SELECT '' AS x");
  });

  it('comentário não fechado consome o resto — não deixa cauda analisável', () => {
    expect(normalizeSql('SELECT 1 /* sem fim').trim()).toBe('SELECT 1');
  });

  it('literal não fechado não deixa cauda executável', () => {
    expect(normalizeSql("SELECT 'sem fim")).toBe("SELECT ''");
  });
});

describe('entrada degenerada', () => {
  it.each(['', '   ', '\n'])('recusa query vazia (%j)', rejectsEach);
  it('recusa query que só tem comentário', () => {
    recusa('-- nada aqui');
  });
});

// O guard só vale se enxergar os limites de literal e identificador EXATAMENTE
// como o BigQuery. Onde os dois léxicos divergem, o guard acha que um trecho é
// string e o BigQuery o executa como código — e `bigquery.query` roda script
// de vários comandos num job só.
describe('léxico alinhado ao do BigQuery', () => {
  it('crase escapada por barra não fecha o identificador (recusa o segundo comando)', () => {
    // BigQuery: `a\`` é o identificador a` ; o que vem depois é código.
    recusa('SELECT 1 AS `a\\`` ; DROP TABLE t ; -- `');
  });

  it("string de três aspas não fecha na aspa simples interna", () => {
    // BigQuery: '''a'b''' é UM literal; o `;` seguinte é código.
    recusa("SELECT '''a'b''' ; DROP TABLE t ; SELECT 'c'");
    recusa('SELECT """a"b""" ; DROP TABLE t ; SELECT "c"');
  });

  it('abertura de três aspas sem fechamento não esconde a cauda', () => {
    // Sem ''' de fechamento, o BigQuery lê '' (vazio) e segue como código.
    recusa("SELECT '''a' ; DROP TABLE t ; --");
  });

  it('literal de três aspas legítimo continua aceito', () => {
    accepts("SELECT '''texto com ' e ; dentro''' AS x FROM contratos");
    expect(normalizeSql("SELECT '''a'b''' AS x")).toBe("SELECT '' AS x");
  });

  it('crase com barra legítima continua aceita', () => {
    accepts('SELECT 1 AS `col\\`una`');
  });
});

// Terminadores de comentário de linha medidos por dry-run (statementType):
// \n e \r terminam `--`/`#` no BigQuery; VT, FF, U+0085, U+2028 e U+2029 não.
describe('comentário de linha termina onde o BigQuery termina', () => {
  it.each([
    ['--c\\r', 'SELECT 1 AS x --c\r; SELECT 2 AS y'],
    ['#c\\r', 'SELECT 1 AS x #c\r; SELECT 2 AS y'],
    ['--\\r + EXPORT DATA', "SELECT 1 AS x --\r; EXPORT DATA OPTIONS(uri='gs://b/*', format='CSV') AS SELECT * FROM contratos"],
    ['#\\r + EXPORT DATA de outro tenant', "SELECT 1 AS x #\r; EXPORT DATA OPTIONS(uri='gs://b/*', format='CSV') AS SELECT * FROM imobiliaria_demo.vendas"],
    ['--\\r + DROP', 'SELECT 1 AS x --\r; DROP TABLE contratos'],
    ['--\\r + DELETE', 'SELECT 1 AS x --\r; DELETE FROM contratos WHERE TRUE'],
    ['--c\\r\\n', 'SELECT 1 AS x --c\r\n; SELECT 2 AS y'],
  ])('recusa %s', (_n, sql) => rejectsEach(sql));

  it.each(['\v', '\f', '\u0085', ' ', ' '])(
    'caractere que o BigQuery mantém no comentário não encerra (%j)',
    (t) => {
      expect(normalizeSql(`SELECT 1 AS x --c${t}; SELECT 2 AS y`).trim()).toBe('SELECT 1 AS x');
    },
  );
});
