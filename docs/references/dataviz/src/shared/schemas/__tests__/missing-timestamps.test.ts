import { describe, it, expect } from 'vitest';
import { Metric } from '../metric';
import { ClientDoc } from '../client';
import { ProductDoc } from '../product';
import { RelationDoc } from '../relation';
import { DataSourceDoc } from '../data-source';

/**
 * Documento gravado antes de `createdAt`/`updatedAt` existirem continua válido.
 *
 * Regressão real: o zod 4.4 mudou o comportamento de `z.unknown()` — chave
 * AUSENTE passou a ser rejeitada (`invalid_type` / `expected: nonoptional`), e
 * só `undefined` explicitamente presente é aceito. Como os timestamps estavam
 * declarados `z.unknown()` sem `.optional()`, toda métrica gravada por seed
 * antigo passou a falhar com HTTP 422 e a página inteira ficou sem número.
 *
 * Não foi pego por typecheck (é comportamento de runtime), nem pela suíte (que
 * monta fixtures completas), nem pelo build. Só apareceu contra o Firestore
 * real. Estes testes montam o documento como ele existe no banco — sem os
 * timestamps — em vez de como seria bonito.
 */
describe('schemas — documento sem createdAt/updatedAt', () => {
  it('métrica: aceita, e preserva shape/outputColumns', () => {
    const doc = {
      id: 'covenants.indice_recebivel',
      label: 'Índice de Recebíveis',
      requires: ['covenants.contratos.saldo_devedor'],
      recipe: { kind: 'sql' as const, template: 'SELECT 1 AS value' },
      shape: 'scalar' as const,
      outputColumns: ['value'],
    };
    const r = Metric.safeParse(doc);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
    if (r.success) {
      expect(r.data.shape).toBe('scalar');
      expect(r.data.outputColumns).toEqual(['value']);
    }
  });

  // Os mesmos timestamps estavam bare em sete schemas; o problema nunca foi de
  // um documento só.
  it.each([
    ['client', ClientDoc, { id: 'vila-rosa', name: 'Vila Rosa' }],
    ['product', ProductDoc, { id: 'p1', name: 'Covenants' }],
    ['relation', RelationDoc, { id: 'r1' }],
    ['data-source', DataSourceDoc, { id: 'ds1' }],
  ])('%s: chave de timestamp ausente não invalida o documento', (_name, schema, doc) => {
    const r = (schema as { safeParse: (d: unknown) => { success: boolean; error?: { issues: unknown[] } } })
      .safeParse(doc);
    // O documento mínimo pode falhar por OUTRO campo obrigatório; o que este
    // teste proíbe é falhar por causa de createdAt/updatedAt.
    const byTimestamp = (r.error?.issues ?? []).some((i) =>
      JSON.stringify(i).includes('createdAt') || JSON.stringify(i).includes('updatedAt'));
    expect(byTimestamp, JSON.stringify(r.error?.issues)).toBe(false);
  });
});
