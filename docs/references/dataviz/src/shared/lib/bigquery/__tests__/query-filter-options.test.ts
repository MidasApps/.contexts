import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return { ...actual, getBigQueryClient: () => ({ query: queryMock }) };
});

import { queryFilterOptions } from '../queries';
import { UnsafeIdentifierError } from '../identifier';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([[]]);
});

const executedSql = (): string[] => queryMock.mock.calls.map(([options]) => options.query as string);

/**
 * Os nomes de coluna da fonte vêm do binding do cliente no Firestore. Sem schema
 * legado, `resolveColumn` devolve o nome cru — então a validação tem de acontecer
 * aqui, antes de o nome virar SQL.
 */
describe('queryFilterOptions', () => {
  it('reads dates and projects from the bound table with quoted columns', async () => {
    await queryFilterOptions('proj-demo.imobiliaria_demo', null, {
      table: 'estoque_snapshot',
      dateField: 'data_base_report',
      projectField: 'empreendimento',
    });

    const [datesSql, projectsSql] = executedSql();
    expect(datesSql).toContain('`proj-demo.imobiliaria_demo.estoque_snapshot`');
    expect(datesSql).toContain('SELECT DISTINCT `data_base_report` AS data_base_report');
    expect(projectsSql).toContain('SELECT DISTINCT `empreendimento` AS projeto');
  });

  it('skips the projects query when the source has no project column', async () => {
    await queryFilterOptions('imobiliaria_demo', null, {
      table: 'estoque_snapshot',
      dateField: 'data_base_report',
      projectField: null,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['dateField', { dateField: 'x; DROP TABLE y --', projectField: null }],
    ['projectField', { dateField: 'data_base_report', projectField: '1 UNION ALL SELECT secret FROM other' }],
  ])('rejects an unsafe %s from the binding before querying', async (_field, columns) => {
    await expect(
      queryFilterOptions('imobiliaria_demo', null, { table: 'estoque_snapshot', ...columns }),
    ).rejects.toBeInstanceOf(UnsafeIdentifierError);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
