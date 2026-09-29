import { describe, it, expect } from 'vitest';
import { guardMetricTemplate } from './guard-metric-template';
import { guardGeneratedSql } from '@/features/ai-agents/lib/sql-guard';

describe('guardMetricTemplate', () => {
  it('aceita template que fala pela entidade do contrato', () => {
    const r = guardMetricTemplate(
      'SELECT COUNT(*) AS value FROM {contratos} WHERE {filter.date_range:contratos.data_base_report}',
    );
    expect(r.ok).toBe(true);
  });

  it('aceita CTE: o segundo FROM aponta para o alias, não para uma tabela', () => {
    const r = guardMetricTemplate(
      'WITH base AS (SELECT {contratos.saldo_devedor} AS v FROM {contratos}) SELECT SUM(v) AS value FROM base',
    );
    expect(r.ok).toBe(true);
  });

  it('aceita FROM UNNEST — é função, não tabela', () => {
    expect(guardMetricTemplate('SELECT x AS value FROM UNNEST([1,2]) AS x').ok).toBe(true);
  });

  it('recusa tabela literal entre crases — o guardrail de leitura sozinho a aceitaria', () => {
    const sql = 'SELECT COUNT(*) AS value FROM `bq-data-wh.liquid_aux.ba_bancos`';
    expect(guardGeneratedSql(sql).ok).toBe(true);

    const r = guardMetricTemplate(sql);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('{contratos}');
  });

  it('recusa caminho projeto.dataset.tabela sem crase', () => {
    const r = guardMetricTemplate('SELECT COUNT(*) AS value FROM bq_data_wh.liquid.contratos');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('bq_data_wh.liquid.contratos');
  });

  it('recusa JOIN em tabela literal, não só FROM', () => {
    const r = guardMetricTemplate(
      'SELECT COUNT(*) AS value FROM {contratos} c JOIN outro.dataset.t x ON x.id = c.id',
    );
    expect(r.ok).toBe(false);
  });

  it('delega a recusa de escrita ao guardrail de SQL', () => {
    expect(guardMetricTemplate('DELETE FROM {contratos}').ok).toBe(false);
    expect(guardMetricTemplate('SELECT 1 AS value; DROP TABLE x').ok).toBe(false);
    expect(guardMetricTemplate('EXPORT DATA OPTIONS(uri="gs://x") AS SELECT 1').ok).toBe(false);
  });

  it('recusa modelo de ML, EXTERNAL_QUERY e função com conexão — o escopo do dry-run não os vê', () => {
    for (const t of [
      'SELECT * FROM ML.PREDICT(MODEL `p.outro.m`, (SELECT {contratos.ltv} FROM {contratos}))',
      "SELECT COUNT(*) AS value FROM EXTERNAL_QUERY('us.conn', 'SELECT 1')",
      "SELECT AI.GENERATE('x', connection_id => 'us.conn') AS value FROM {contratos}",
    ]) {
      expect(guardMetricTemplate(t).ok, t).toBe(false);
    }
  });

  /**
   * Comentário e literal são texto, não endereço de leitura. Recusar por causa
   * deles ensinaria o modelo a apagar a explicação do próprio SQL.
   */
  it('não confunde comentário nem string com nome de tabela', () => {
    const r = guardMetricTemplate(
      "-- fonte: bq-data-wh.liquid.contratos\nSELECT COUNT(*) AS value FROM {contratos} WHERE {contratos.status} = 'a.b.c'",
    );
    expect(r.ok).toBe(true);
  });
});

describe('guardMetricTemplate — crase colada', () => {
  it('recusa função de IA colada à crase, que roda a cada render', () => {
    expect(guardMetricTemplate("SELECT`AI`.GENERATE('x', endpoint => 'g') AS value FROM {contratos}").ok).toBe(false);
    expect(guardMetricTemplate('SELECT * FROM`ML`.PREDICT(MODEL`outro.m`, (SELECT 1 AS a))').ok).toBe(false);
  });
});

/**
 * Furos da regra de tabela literal achados na revisão do PR #26. O escopo do
 * dry-run ainda barrava a leitura; a guarda do template é a primeira barreira.
 */
describe('guardMetricTemplate — tabela literal em outras formas', () => {
  it.each([
    ['crase colada ao FROM', 'SELECT COUNT(*) AS value FROM`p.outro.t`'],
    ['crase colada ao JOIN', 'SELECT COUNT(*) AS value FROM {contratos} c JOIN`p.outro.t` x ON x.id = c.id'],
    ['join por vírgula', 'SELECT COUNT(*) AS value FROM {contratos} c, outro.dataset.t'],
    ['join por vírgula entre crases', 'SELECT COUNT(*) AS value FROM {contratos} c, `p.outro.t` x'],
    ['join por vírgula depois de JOIN', 'SELECT 1 AS value FROM {contratos} c JOIN {vendas} v ON v.id = c.id, outro.ds.t'],
    ['join por vírgula em subquery', 'SELECT (SELECT COUNT(*) FROM {contratos} c, outro.ds.t) AS value'],
    ['TABLE como argumento', 'SELECT * FROM tvf(TABLE outro.ds.t)'],
  ])('recusa %s', (_n, sql) => {
    expect(guardMetricTemplate(sql).ok).toBe(false);
  });

  it.each([
    ['array da própria linha', 'SELECT COUNT(*) AS value FROM {contratos} c, c.parcelas p'],
    ['array da própria linha com AS', 'SELECT COUNT(*) AS value FROM {contratos} AS c, UNNEST(c.parcelas) p'],
    ['vírgula dentro de função', 'SELECT COUNT(*) AS value FROM {contratos} WHERE {contratos.status} IN (1, 2)'],
    ['EXTRACT com coluna qualificada', 'SELECT EXTRACT(MONTH FROM c.{contratos.data_inicio}) AS value FROM {contratos} c'],
    ['EXTRACT de DATE', 'SELECT EXTRACT(DATE FROM c.{contratos.criado_em}) AS value FROM {contratos} c'],
    ['IS DISTINCT FROM', 'SELECT COUNT(*) AS value FROM {contratos} c WHERE c.{contratos.a} IS DISTINCT FROM c.{contratos.b}'],
    ['CTE depois de vírgula', 'WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) SELECT a.x + b.y AS value FROM a, b'],
  ])('aceita %s', (_n, sql) => {
    expect(guardMetricTemplate(sql).ok).toBe(true);
  });
});

/** Furos achados na revisão de segurança desta regra. */
describe('guardMetricTemplate — revisão da regra de tabela literal', () => {
  it.each([
    ['espaço em volta do ponto', 'SELECT COUNT(*) AS value FROM outro . tabela'],
    ['quebra de linha antes do ponto', 'SELECT COUNT(*) AS value FROM {contratos} c JOIN outro\n.tabela t ON t.id = c.id'],
    ['vírgula com espaço no ponto', 'SELECT COUNT(*) AS value FROM {contratos} c, outro . tabela'],
    ['comentário no ponto', 'SELECT COUNT(*) AS value FROM outro/**/.tabela'],
    ['TABLE com espaço no ponto', 'SELECT * FROM tvf(TABLE outro . t)'],
    ['alias de CTE usado para isentar', 'WITH x AS (SELECT * FROM {contratos} outro) SELECT COUNT(*) AS value FROM x, outro.tabela'],
    ['alias de coluna usado para isentar', 'SELECT COUNT(*) AS value, {contratos.id} outro FROM {contratos} c, outro.tabela'],
    ['alias de subquery na mesma cláusula', 'SELECT 1 AS value FROM (SELECT * FROM {contratos} outro) s, outro.tabela'],
  ])('recusa %s', (_n, sql) => {
    expect(guardMetricTemplate(sql).ok).toBe(false);
  });

  it('continua aceitando o array da linha com o alias na própria cláusula', () => {
    expect(guardMetricTemplate('SELECT COUNT(*) AS value FROM {contratos} c JOIN {vendas} v ON v.id = c.id, v.itens i').ok).toBe(true);
  });
});
