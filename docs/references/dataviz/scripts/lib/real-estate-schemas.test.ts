import { describe, expect, it } from 'vitest';
import { REAL_ESTATE_ENTITIES, REAL_ESTATE_KEYS, REAL_ESTATE_SCHEMA, toTableFields } from './real-estate-schemas.mjs';

const TYPES = new Set(['STRING', 'INT64', 'FLOAT64', 'DATE', 'TIMESTAMP', 'BOOL']);

describe('REAL_ESTATE_SCHEMA', () => {
  it('has 20 tables, each with a description for the contract', () => {
    const tables = Object.keys(REAL_ESTATE_SCHEMA);
    expect(tables).toHaveLength(20);
    for (const table of tables) expect(REAL_ESTATE_ENTITIES[table as keyof typeof REAL_ESTATE_ENTITIES], `sem descrição: ${table}`).toBeDefined();
  });

  it('uses only BigQuery types the loader knows and no duplicate columns', () => {
    for (const [table, columns] of Object.entries(REAL_ESTATE_SCHEMA)) {
      const names = columns.map(([name]) => name);
      expect(new Set(names).size, `coluna repetida em ${table}`).toBe(names.length);
      for (const [name, type] of columns) {
        expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(TYPES.has(type), `${table}.${name}: ${type}`).toBe(true);
      }
    }
  });

  it('snapshot tables carry data_base_report as DATE (the app pins on that literal)', () => {
    for (const table of ['estoque_snapshot', 'carteira_locacao_snapshot'] as const) {
      const column = REAL_ESTATE_SCHEMA[table].find(([name]) => name === 'data_base_report');
      expect(column?.[1]).toBe('DATE');
    }
  });

  it('every key column exists in at least one table', () => {
    const allColumns = new Set(Object.values(REAL_ESTATE_SCHEMA).flat().map(([name]) => name));
    for (const key of REAL_ESTATE_KEYS) expect(allColumns.has(key), `chave órfã: ${key}`).toBe(true);
  });

  it('toTableFields yields NULLABLE fields', () => {
    expect(toTableFields(REAL_ESTATE_SCHEMA.unidades)[0]).toEqual({ name: 'unidade_id', type: 'STRING', mode: 'NULLABLE' });
  });
});
