import { describe, expect, it } from 'vitest';
import { generatePortfolio } from './synthetic-portfolio';
import { AUX_SCHEMA, COVENANTS_SCHEMA, MONITOR_SCHEMA } from './vila-rosa-schemas.mjs';

const small = () => generatePortfolio({ seed: 7, months: 3, contractsPerProject: 5, lastSnapshot: '2025-03-31' });

describe('generatePortfolio', () => {
  it('is deterministic for the same seed', () => {
    expect(JSON.stringify(small())).toBe(JSON.stringify(small()));
  });

  it('produces every table the product reads, with the contract columns', () => {
    const T = small();
    const expected = { ...MONITOR_SCHEMA, ...COVENANTS_SCHEMA, ...AUX_SCHEMA };
    for (const [table, columns] of Object.entries(expected)) {
      expect(T[table]?.length, `tabela ${table} vazia`).toBeGreaterThan(0);
      const keys = new Set(Object.keys(T[table][0]));
      for (const [name] of columns) expect(keys.has(name), `${table}.${name} ausente`).toBe(true);
    }
  });

  it('uses exactly the literals the metric SQL compares', () => {
    const T = small();
    const statuses = new Set(T.contratos.map((r) => r.status_contrato));
    expect([...statuses].every((s) => ['ATIVO', 'QUITADO', 'DISTRATADO'].includes(String(s)))).toBe(true);
    expect(new Set(T.fluxo_caixa.map((r) => r.tipo_recebivel))).toEqual(new Set(['Pré-chaves', 'Pós-chaves']));
    expect(new Set(T.transacoes.map((r) => r.tipo))).toEqual(new Set(['CREDIT', 'DEBIT']));
    expect(T.certidoes.some((r) => r.status === 'Válida')).toBe(true);
    for (const r of T.contratos) {
      expect(String(r.faixa_atraso_1)).toMatch(/^0[0-5]\. /);
      expect(String(r.faixa_atraso_2)).toMatch(/^0[0-4]\. /);
      expect('ABCDEFGH').toContain(String(r.rating_liquid));
    }
  });

  it('keeps the tables consistent with each other', () => {
    const T = small();
    const ids = new Set(T.contratos.map((r) => r.id_contrato));
    for (const r of T.fluxo_caixa) expect(ids.has(r.id_contrato)).toBe(true);
    for (const r of T.pagamentos) expect(ids.has(r.id_contrato)).toBe(true);
    const categories = new Set(T.ba_pluggy_categorias.map((r) => r.description));
    for (const r of T.transacoes) expect(categories.has(r.categoria)).toBe(true);
    const banks = new Set(T.ba_bancos.map((r) => r.numero_codigo));
    for (const r of T.transacoes) expect(banks.has(r.banco_codigo)).toBe(true);
  });

  it('emits one monthly snapshot per requested month', () => {
    const T = small();
    expect([...new Set(T.contratos.map((r) => r.data_base_report))].sort()).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
  });
});
