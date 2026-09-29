/**
 * Fixtures SQL para o scorer `sql_correctness`.
 * Cada fixture tem `expectedRange` para asserts em testes.
 */

export interface SqlFixture {
  id: string;
  sql: string;
  /** Bytes simulados de dry-run (mock). */
  mockBytes: number;
  /** Range esperado do score final (inclusive). */
  expectedRange: [number, number];
  description: string;
}

export const SQL_FIXTURES: SqlFixture[] = [
  {
    id: 'good-explicit-cols-with-partition',
    sql: `SELECT contrato_id, saldo_devedor, data_competencia
          FROM \`liquid.contratos\`
          WHERE data_competencia >= '2024-01-01'`,
    mockBytes: 1_000_000_000, // 1GB
    expectedRange: [0.95, 1.0],
    description: 'Bom: colunas explícitas + partition filter + bytes ok.',
  },
  {
    id: 'good-aggregation-partition',
    sql: `SELECT projeto_id, SUM(saldo_devedor) AS total
          FROM \`liquid.contratos\`
          WHERE data_competencia BETWEEN '2024-01-01' AND '2024-12-31'
          GROUP BY projeto_id`,
    mockBytes: 5_000_000_000,
    expectedRange: [0.95, 1.0],
    description: 'Bom: agregação com partition filter explícito.',
  },
  {
    id: 'bad-select-star',
    sql: `SELECT * FROM \`liquid.contratos\` WHERE data_competencia >= '2024-01-01'`,
    mockBytes: 2_000_000_000,
    expectedRange: [0.0, 0.3],
    description: 'Ruim: SELECT * (anti-pattern de schema).',
  },
  {
    id: 'bad-cross-join',
    sql: `SELECT a.contrato_id, b.projeto_id
          FROM \`liquid.contratos\` a CROSS JOIN \`liquid.projetos\` b
          WHERE a.data_competencia >= '2024-01-01'`,
    mockBytes: 5_000_000_000,
    expectedRange: [0.0, 0.3],
    description: 'Ruim: CROSS JOIN explosivo.',
  },
  {
    id: 'bad-no-partition-filter',
    sql: `SELECT contrato_id, saldo_devedor FROM \`liquid.contratos\``,
    mockBytes: 10_000_000_000,
    expectedRange: [0.0, 0.5],
    description: 'Ruim: sem filtro de partição.',
  },
  {
    id: 'bad-bytes-over-100gb',
    sql: `SELECT contrato_id, saldo_devedor
          FROM \`liquid.contratos\`
          WHERE data_competencia >= '2020-01-01'`,
    mockBytes: 150_000_000_000, // 150GB
    expectedRange: [0.0, 0.4],
    description: 'Ruim: dry-run estima >100GB.',
  },
];
