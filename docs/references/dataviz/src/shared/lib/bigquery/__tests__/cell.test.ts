import { describe, it, expect } from 'vitest';
import { unwrapCell, unwrapRows } from '../cell';

/**
 * A fronteira onde a linha do BigQuery entra no aplicativo.
 *
 * DATE, DATETIME, TIMESTAMP e TIME não voltam como primitivo: o cliente do BQ
 * entrega instâncias (`BigQueryDate` e irmãs) cujo único campo próprio é
 * `value`. O embrulho ATRAVESSA o JSON da API — medido:
 *
 *     String(new BigQueryDate(...))          === '[object Object]'
 *     JSON.parse(JSON.stringify(celula))     === { value: '2026-09-15' }
 *     String({ value: '2026-09-15' })        === '[object Object]'
 *
 * Era isso que três indicadores do Vila Rosa exibiam no lugar da data.
 */
describe('unwrapCell', () => {
  it('a data do BigQuery vira a string que ela representa', () => {
    expect(unwrapCell({ value: '2026-09-15' })).toBe('2026-09-15');
  });

  it('o timestamp também', () => {
    expect(unwrapCell({ value: '2026-09-15T18:16:24.649875000Z' }))
      .toBe('2026-09-15T18:16:24.649875000Z');
  });

  it('primitivo passa intacto', () => {
    expect(unwrapCell(7)).toBe(7);
    expect(unwrapCell('texto')).toBe('texto');
    expect(unwrapCell(null)).toBeNull();
    expect(unwrapCell(undefined)).toBeUndefined();
    expect(unwrapCell(false)).toBe(false);
  });

  /*
   * A heurística antiga era `'value' in objeto`, que confunde o embrulho com
   * um STRUCT que por acaso tenha um campo `value`. O embrulho tem UM campo
   * próprio e só; um STRUCT com mais campos é dado composto, e desmontá-lo
   * aqui devolveria uma coluna no lugar da linha.
   */
  it('STRUCT com outros campos não é embrulho — passa intacto', () => {
    const struct = { value: 10, moeda: 'BRL' };
    expect(unwrapCell(struct)).toBe(struct);
  });

  it('array de datas desembrulha item a item', () => {
    expect(unwrapCell([{ value: '2026-01-01' }, { value: '2026-02-01' }]))
      .toEqual(['2026-01-01', '2026-02-01']);
  });

  it('unwrapRows percorre todas as colunas de todas as linhas', () => {
    expect(
      unwrapRows([
        { bucket: { value: '2026-01-01' }, value: 10 },
        { bucket: { value: '2026-02-01' }, value: 12 },
      ]),
    ).toEqual([
      { bucket: '2026-01-01', value: 10 },
      { bucket: '2026-02-01', value: 12 },
    ]);
  });

  it('linha sem embrulho nenhum sai equivalente', () => {
    expect(unwrapRows([{ value: 1, nome: 'a' }])).toEqual([{ value: 1, nome: 'a' }]);
  });

  /* NUMERIC chega como `Big` (big.js), cujo `toJSON` já emite string: o JSON
     da API entrega "1.5", não um objeto. Não há o que desembrulhar. */
  it('não mexe no que já é número', () => {
    expect(unwrapRows([{ value: 1.5 }])).toEqual([{ value: 1.5 }]);
  });
});
