import { describe, it, expect } from 'vitest';
import { guardGeneratedSql } from '../sql-guard';

/**
 * O escopo de tenant confere o que o dry-run lista em `referencedTables` e
 * `referencedRoutines`. Modelo de ML (`ML.*(MODEL …)`), `EXTERNAL_QUERY` e as
 * funções que usam uma CONNECTION (`ML.GENERATE_TEXT`, `AI.*`, `OBJ.*`) não
 * aparecem ali: o escopo é cego para elas. Não são SQL analítico simples, e
 * nenhum caminho de SQL escrito pelo modelo precisa delas — os tools BQML
 * montam o próprio `ML.*` em volta de um `modelRef` validado.
 */

function recusa(sql: string): string {
  const r = guardGeneratedSql(sql);
  expect(r.ok, `deveria recusar: ${JSON.stringify(sql)}`).toBe(false);
  return r.ok ? '' : r.error;
}

function accepts(sql: string): void {
  const r = guardGeneratedSql(sql);
  expect(r.ok, `deveria aceitar: ${JSON.stringify(sql)}`).toBe(true);
}

describe('guardGeneratedSql — recusa o que o escopo do dry-run não enxerga', () => {
  it.each([
    ['ML.PREDICT com modelo de outro dataset', 'SELECT * FROM ML.PREDICT(MODEL `p.outro_bqml.m`, (SELECT 1 AS x))'],
    ['ML.FORECAST', 'SELECT * FROM ML.FORECAST(MODEL outro.m, STRUCT(3 AS horizon))'],
    ['ML.GENERATE_TEXT', "SELECT * FROM ML.GENERATE_TEXT(MODEL m, (SELECT 'oi' AS prompt))"],
    ['ML.GENERATE_EMBEDDING', 'SELECT * FROM ML.GENERATE_EMBEDDING(MODEL m, TABLE contratos)'],
    ['ML.* em minúsculas', 'select * from ml.predict(model m, table contratos)'],
    ['ML.* escondido em CTE', 'WITH a AS (SELECT * FROM ML.PREDICT(MODEL m, TABLE contratos)) SELECT * FROM a'],
    ['ML.* qualificado por projeto', 'SELECT * FROM p.ML.PREDICT(MODEL m, TABLE contratos)'],
    ['ML.* partido por comentário de bloco', 'SELECT * FROM ML/**/.PREDICT(MODEL m, TABLE contratos)'],
    ['ML.* partido por comentário de linha', 'SELECT * FROM ML --x\n.PREDICT(MODEL m, TABLE contratos)'],
    ['ML.* com espaços em volta do ponto', 'SELECT * FROM ML . PREDICT (MODEL m, TABLE contratos)'],
    ['ML.* entre crases', 'SELECT * FROM `ML.PREDICT`(MODEL m, TABLE contratos)'],
    ['ML escalar', 'SELECT ML.DISTANCE([1.0], [2.0]) AS d'],
    ['EXTERNAL_QUERY', "SELECT * FROM EXTERNAL_QUERY('p.us.conn', 'SELECT * FROM clientes')"],
    ['EXTERNAL_QUERY entre crases', "SELECT * FROM `EXTERNAL_QUERY`('us.conn', 'SELECT 1')"],
    ['EXTERNAL_OBJECT_TRANSFORM', "SELECT * FROM EXTERNAL_OBJECT_TRANSFORM(TABLE t, ['SIGNED_URL'])"],
    ['AI.GENERATE escalar', "SELECT AI.GENERATE('resuma', connection_id => 'us.conn') AS r"],
    ['AI.FORECAST', "SELECT * FROM AI.FORECAST(TABLE contratos, data_col => 'x', timestamp_col => 't')"],
    ['OBJ.MAKE_REF', "SELECT OBJ.MAKE_REF('gs://b/o', 'us.conn') AS r"],
    ['CONNECTION DEFAULT', "SELECT * FROM f(CONNECTION DEFAULT, 'x')"],
    ['CONNECTION nomeada', 'SELECT * FROM f(CONNECTION `p.us.conn`)'],
    ['CONNECTION qualificada sem crase', 'SELECT * FROM f(x, CONNECTION us.conn)'],
    ['WITH CONNECTION', 'SELECT * FROM f(x WITH CONNECTION c)'],
    ['argumento nomeado connection_id', "SELECT f(x, connection_id => 'us.conn') AS r FROM contratos"],
    ['MODEL como argumento de função', 'SELECT * FROM qualquer_tvf(MODEL m, TABLE contratos)'],
  ])('%s', (_name, sql) => {
    expect(recusa(sql)).toMatch(/modelo de ML|conexão|função de IA|não é aceit/i);
  });
});

/**
 * As views de metadados do dataset do PRÓPRIO cliente passam no escopo, mas
 * devolvem o id do projeto como dado (`table_catalog`, `project_id`).
 */
describe('guardGeneratedSql — recusa metadados do dataset', () => {
  it.each([
    ['INFORMATION_SCHEMA.TABLES', 'SELECT table_catalog FROM INFORMATION_SCHEMA.TABLES'],
    ['INFORMATION_SCHEMA qualificado', 'SELECT * FROM ds.INFORMATION_SCHEMA.COLUMNS'],
    ['INFORMATION_SCHEMA regional', 'SELECT * FROM `region-us`.INFORMATION_SCHEMA.JOBS'],
    ['INFORMATION_SCHEMA em minúsculas', 'select * from information_schema.routines'],
    ['INFORMATION_SCHEMA entre crases', 'SELECT * FROM `ds.INFORMATION_SCHEMA.TABLES`'],
    ['INFORMATION_SCHEMA com escape', 'SELECT * FROM `ds.\\x49NFORMATION_SCHEMA.TABLES`'],
    ['INFORMATION_SCHEMA partido por comentário', 'SELECT * FROM ds./**/INFORMATION_SCHEMA.TABLES'],
    ['__TABLES__', 'SELECT project_id FROM ds.__TABLES__'],
    ['__TABLES__ entre crases', 'SELECT project_id FROM `ds.__TABLES__`'],
    ['__TABLES_SUMMARY__', 'SELECT * FROM ds.__TABLES_SUMMARY__'],
    ['__PARTITIONS_SUMMARY__', 'SELECT * FROM `ds.contratos$__PARTITIONS_SUMMARY__`'],
  ])('%s', (_name, sql) => {
    expect(recusa(sql)).toMatch(/metadados do dataset/);
  });

  it.each([
    ['coluna com information no nome', 'SELECT information_status FROM contratos'],
    ['string com INFORMATION_SCHEMA', "SELECT 'INFORMATION_SCHEMA' AS rotulo FROM contratos"],
    ['comentário com __TABLES__', 'SELECT 1 AS x -- __TABLES__'],
  ])('continua aceitando %s', (_name, sql) => {
    accepts(sql);
  });
});

describe('guardGeneratedSql — o que parece, mas não é, continua passando', () => {
  it.each([
    ['alias ml com coluna', 'SELECT ml.saldo_devedor FROM contratos AS ml'],
    ['alias ai com coluna', 'SELECT ai.valor FROM contratos ai WHERE ai.valor > 0'],
    ['alias obj em função', 'SELECT SUM(obj.valor) FROM contratos obj'],
    ['coluna model', 'SELECT model, COUNT(*) AS n FROM veiculos GROUP BY model'],
    ['coluna model em função', 'SELECT COUNT(model) AS n, CAST(model AS STRING) AS m FROM veiculos'],
    ['coluna model em DISTINCT', 'SELECT COUNT(DISTINCT model) AS n FROM veiculos'],
    ['coluna connection', 'SELECT connection, COUNT(*) AS n FROM acessos GROUP BY connection'],
    ['coluna connection qualificada', 'SELECT a.connection FROM acessos a'],
    ['ML.PREDICT em literal', "SELECT 'ML.PREDICT(MODEL x)' AS texto"],
    ['EXTERNAL_QUERY em comentário', "-- não use EXTERNAL_QUERY('c', 'q')\nSELECT 1 AS x"],
    ['coluna com prefixo external_', 'SELECT external_id FROM contratos'],
    ['coluna terminada em _ml', 'SELECT score_ml FROM contratos'],
    ['coluna connection com alias sem AS', 'SELECT connection c FROM acessos'],
    ['colunas model e connection com alias sem AS', 'SELECT model m, connection conn FROM acessos'],
    ['coluna connection antes de FROM qualificado', 'SELECT connection FROM vila_rosa_monitor.acessos'],
    ['CTE chamada connection', 'WITH connection AS (SELECT 1 AS a) SELECT a FROM connection'],
  ])('%s', (_name, sql) => accepts(sql));
});

/**
 * Revisão do PR P: um caractere de palavra colado à crase juntava os tokens no
 * texto analisado (`FROM\`ML\`` virava `FROMML`) e todo padrão caía. O
 * BigQuery trata a crase como fronteira de token e aceita a função de verdade
 * (conferido por dry-run). E o conteúdo da crase aceita escape: `\x4DL` é `ML`.
 */
describe('guardGeneratedSql — crase colada e escape dentro da crase', () => {
  it.each([
    ['FROM`ML`.PREDICT', 'SELECT * FROM`ML`.PREDICT(MODEL`vila_rosa_monitor.m`, (SELECT 1 AS a))'],
    ['FROM`ML.PREDICT`', 'SELECT * FROM`ML.PREDICT`(MODEL`imobiliaria_demo.m`, (SELECT 1 AS a))'],
    ['JOIN`ML`', 'SELECT * FROM contratos JOIN`ML`.PREDICT(MODEL`imobiliaria_demo.m`, (SELECT 1 AS a)) ON TRUE'],
    ['SELECT`AI`', "SELECT`AI`.GENERATE('hi', endpoint => 'gemini-2.0-flash') AS r"],
    ['SELECT`AI.GENERATE`', "SELECT`AI.GENERATE`('hi', endpoint => 'gemini-2.0-flash') AS r"],
    ['SELECT`OBJ`', "SELECT`OBJ`.MAKE_REF('gs://b/x', 'us.c') AS r"],
    ['FROM`EXTERNAL_QUERY`', "SELECT * FROM`EXTERNAL_QUERY`('us.conn', 'SELECT 1')"],
    ['crase antes do parêntese', "SELECT * FROM `EXTERNAL_QUERY`('us.conn', 'SELECT 1')"],
    ['crase depois de vírgula', "SELECT 1 AS a,`AI`.GENERATE('hi', endpoint => 'g') AS r"],
    ['crase depois de parêntese', "SELECT IF(TRUE,`OBJ`.MAKE_REF('gs://b/x', 'us.c'), NULL) AS r"],
    ['caminho aninhado em crases', 'SELECT * FROM `proj-x`.`ML`.PREDICT(MODEL m, TABLE contratos)'],
    ['caminho aninhado colado', 'SELECT * FROM`proj-x`.`ML`.`PREDICT`(MODEL`m`, TABLE contratos)'],
    ['MODEL colado à crase', 'SELECT * FROM qualquer_tvf(MODEL`m`, TABLE contratos)'],
    ['CONNECTION colado à crase', 'SELECT * FROM f(CONNECTION`p.us.conn`)'],
    ['escape \\x4D', 'SELECT * FROM`\\x4DL`.PREDICT(TABLE contratos)'],
    ['escape \\u0041', "SELECT `\\u0041I`.GENERATE('hi', endpoint => 'g') AS r"],
    ['escape \\U', "SELECT `\\U0000004FBJ`.MAKE_REF('gs://b/x', 'us.c') AS r"],
    ['escape octal', "SELECT * FROM `\\105XTERNAL_QUERY`('us.conn', 'SELECT 1')"],
  ])('%s', (_name, sql) => {
    expect(recusa(sql)).toMatch(/modelo de ML|conexão|função de IA|não é aceit/i);
  });

  it.each([
    ['colunas entre crases', 'SELECT model, `connection`, `ml`.x FROM contratos AS ml'],
    ['crase colada a coluna comum', 'SELECT`saldo_devedor`FROM`contratos`'],
    ['tabela entre crases com hífen', 'SELECT * FROM`proj-x.vila_rosa_monitor.contratos`'],
  ])('continua aceitando: %s', (_name, sql) => accepts(sql));
});

/**
 * Revisão 2 do PR P: variável de sistema e função de identidade devolvem, como
 * DADO, o id do projeto e o e-mail da service account pelo `execute_sql` —
 * por fora da redação de `formatToolError`. E `KEYS.*` referencia chave do
 * KMS, que o escopo do dry-run não enxerga (como a CONNECTION).
 */
describe('guardGeneratedSql — identidade, variável de sistema e KMS', () => {
  it.each([
    ['@@project_id', 'SELECT @@project_id AS p'],
    ['@@dataset_id', 'SELECT @@dataset_id AS d FROM contratos'],
    ['@@ com espaço e crase', 'SELECT @@ `project_id` AS p'],
    ['@@ em WHERE', "SELECT 1 FROM contratos WHERE @@location = 'US'"],
    ['SESSION_USER()', 'SELECT SESSION_USER() AS u'],
    ['session_user minúsculo', 'SELECT session_user () AS u'],
    ['SAFE.SESSION_USER', 'SELECT SAFE.SESSION_USER() AS u'],
    ['SESSION_USER entre crases', 'SELECT `SESSION_USER`() AS u'],
    ['CURRENT_USER()', 'SELECT CURRENT_USER() AS u'],
    ['KEYS.KEYSET_CHAIN', "SELECT AEAD.DECRYPT_STRING(KEYS.KEYSET_CHAIN('gcp-kms://projects/p/locations/us/keyRings/r/cryptoKeys/k', b''), b'', '') AS s"],
    ['KEYS.NEW_KEYSET', "SELECT KEYS.NEW_KEYSET('AEAD_AES_GCM_256') AS k"],
    ['KEYS colado à crase', "SELECT`KEYS`.NEW_KEYSET('AEAD_AES_GCM_256') AS k"],
  ])('%s', (_name, sql) => {
    expect(recusa(sql)).toMatch(/não é aceit/i);
  });

  it.each([
    ['parâmetro de query com @', 'SELECT 1 FROM contratos WHERE data_base_report = @d'],
    ['@@ dentro de literal', "SELECT '@@project_id' AS s"],
    ['coluna session_user sem parênteses', 'SELECT session_user FROM acessos'],
    ['coluna keys', 'SELECT keys, k.keys FROM chaves k'],
    ['SESSION_USER em comentário', '-- SESSION_USER()\nSELECT 1 AS x'],
  ])('continua aceitando: %s', (_name, sql) => accepts(sql));
});
