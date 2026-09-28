#!/usr/bin/env node
/**
 * Introspecção dos datasets do lote. **Somente leitura**: consulta apenas
 * `INFORMATION_SCHEMA.COLUMNS`, sem DML e sem DDL — o BigQuery é produção
 * compartilhada da operação, não base deste app.
 *
 * Grava um JSON para o `seed.mjs` verificar os dicionários contra o schema
 * real. Essa separação é o que permite ao seed abortar em divergência de tipo
 * em vez de gravar um contrato que descreve outra coisa.
 *
 * Uso:
 *   BIGQUERY_PROJECT_ID=seu-projeto \
 *     node scripts/onboarding-lote-2026-09/introspecta.mjs schemas.json
 */
import { BigQuery } from '@google-cloud/bigquery';
import { writeFileSync } from 'node:fs';

const PROJECT = process.env.BIGQUERY_PROJECT_ID;
if (!PROJECT) {
  console.error('Defina BIGQUERY_PROJECT_ID.');
  process.exit(1);
}
const SAIDA = process.argv[2] ?? 'schemas.json';

const DATASETS = [
  // O lote.
  'spl_monitor',
  'masa_monitor',
  'brz_monitor',
  'brz_backtest',
  'construtora_sudoeste_monitor',
  'jotanunes_monitor',
  'jotanunes_backtest',
  'om_monitor',
  'ms_monitor',
  // Referências já em produção, para comparar a forma esperada.
  'vita_urbana_monitor',
  'cedro_rosa_monitor',
];

/** Só as 3 entidades do contrato interessam; `backup_*` e `bkp_*` são ruído. */
const TABELAS = new Set(['contratos', 'fluxo_caixa', 'pagamentos']);

const bq = new BigQuery({
  projectId: PROJECT,
  keyFilename: process.env.BIGQUERY_CREDENTIALS,
  scopes: [
    'https://www.googleapis.com/auth/bigquery',
    'https://www.googleapis.com/auth/drive.readonly',
  ],
});

const resultado = {};

for (const ds of DATASETS) {
  const sql = `
    SELECT table_name, column_name, ordinal_position, data_type, is_nullable
    FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.COLUMNS\`
    ORDER BY table_name, ordinal_position
  `;
  try {
    const [rows] = await bq.query({ query: sql, useLegacySql: false });
    const tabelas = {};
    for (const r of rows) {
      if (!TABELAS.has(r.table_name)) continue;
      (tabelas[r.table_name] ??= []).push({
        name: r.column_name,
        pos: Number(r.ordinal_position),
        type: r.data_type,
        nullable: r.is_nullable === 'YES',
      });
    }
    resultado[ds] = { ok: true, tabelas };
    const resumo = Object.entries(tabelas).map(([t, c]) => `${t}:${c.length}`).join('  ');
    console.log(`ok     ${ds.padEnd(30)} ${resumo}`);
  } catch (e) {
    resultado[ds] = { ok: false, erro: String(e.message ?? e).slice(0, 300) };
    console.log(`FALHOU ${ds.padEnd(30)} ${String(e.message ?? e).slice(0, 180)}`);
  }
}

writeFileSync(SAIDA, JSON.stringify(resultado, null, 2), 'utf8');
console.log(`\nescrito: ${SAIDA}`);
