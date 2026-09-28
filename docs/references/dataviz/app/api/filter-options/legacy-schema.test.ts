import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/shared/lib/bigquery/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/bigquery/client')>();
  return { ...actual, getBigQueryClient: () => ({ query: queryMock }) };
});

import { queryFilterOptions } from '@/shared/lib/bigquery/queries';
import { DEFAULT_FILTER_SOURCE } from '@/shared/lib/bigquery/filter-source';
import { parseClientDoc } from './parse-client-doc';
import { listUnavailableFields } from './unavailable-fields';

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([[]]);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

// The warning is deduplicated per process, so each parse uses its own client id.
let clientSeq = 0;
const nextClientId = () => `legacy-schema-client-${++clientSeq}`;

const DS = 'ds';
const executedSql = (): string[] => queryMock.mock.calls.map(([options]) => options.query as string);

type Outcome = { sql: string[]; unavailableFields: string[] };

/**
 * Oracle: the route at 2421740 (main), copied verbatim. It cast the raw map,
 * passed it to `queryFilterOptions`, then walked it for `null` fields.
 */
async function runAsOnMain(raw: { schema?: unknown }): Promise<Outcome> {
  queryMock.mockClear();
  const clientSchema = (raw.schema as Record<string, Record<string, string | null>> | undefined) ?? null;
  await queryFilterOptions(DS, clientSchema, DEFAULT_FILTER_SOURCE);
  const unavailableFields: string[] = [];
  if (clientSchema) {
    for (const [, tableFields] of Object.entries(clientSchema)) {
      for (const [field, mapped] of Object.entries(tableFields)) {
        if (mapped === null) unavailableFields.push(field);
      }
    }
  }
  return { sql: executedSql(), unavailableFields };
}

/** The route now: the map comes out of `parseClientDoc`, validated per entry. */
async function runNow(raw: { schema?: unknown }): Promise<Outcome> {
  queryMock.mockClear();
  const lookup = parseClientDoc(nextClientId(), { dataset: DS, ...raw });
  await queryFilterOptions(DS, lookup.schema ?? null, DEFAULT_FILTER_SOURCE);
  return { sql: executedSql(), unavailableFields: listUnavailableFields(lookup.schema) };
}

describe('legacy schema map: equivalence with main', () => {
  const validMaps: Array<{ name: string; schema?: unknown }> = [
    { name: 'no schema field' },
    { name: 'null schema', schema: null },
    { name: 'empty schema', schema: {} },
    { name: 'empty source table', schema: { contratos: {} } },
    { name: 'renamed date and project columns', schema: { contratos: { data_base_report: 'dt_ref', projeto: 'nm_proj' } } },
    { name: 'project unavailable', schema: { contratos: { projeto: null } } },
    { name: 'date field mapped to null', schema: { contratos: { data_base_report: null } } },
    { name: 'unsafe column name falls back to the canonical one', schema: { contratos: { data_base_report: 'x; DROP TABLE y' } } },
    { name: 'empty column name falls back to the canonical one', schema: { contratos: { data_base_report: '' } } },
    {
      name: 'null fields across several tables, in document order',
      schema: { pagamentos: { valor_pago: null, dt_pgto: 'dt' }, contratos: { saldo_devedor: null, projeto: 'nm_proj' } },
    },
    // Malformed, but main already ignored these: dropping them changes nothing.
    { name: 'numeric column value (dropped; main fell back too)', schema: { contratos: { data_base_report: 5 } } },
    { name: 'object column value (dropped; main fell back too)', schema: { contratos: { data_base_report: { a: 1 } } } },
    { name: 'false column value (dropped; main fell back too)', schema: { contratos: { data_base_report: false } } },
    { name: 'string schema (dropped; main read nothing from it)', schema: 'abc' },
    { name: 'numeric schema (dropped; main read nothing from it)', schema: 7 },
  ];

  it.each(validMaps)('$name', async (raw) => {
    const before = await runAsOnMain(raw);
    const now = await runNow(raw);

    expect(now).toEqual(before);
  });

  /** Shapes that threw on main (the route answered 500 for this client). */
  const fixedCrashes: Array<{ name: string; schema: unknown; expected: Outcome['unavailableFields']; dateColumn: string }> = [
    { name: 'null table value', schema: { contratos: null }, expected: [], dateColumn: 'data_base_report' },
    {
      name: 'null value on another table keeps the valid source table',
      schema: { pagamentos: null, contratos: { data_base_report: 'dt_ref', saldo_devedor: null } },
      expected: ['saldo_devedor'],
      dateColumn: 'dt_ref',
    },
    { name: 'string value for the source table', schema: { contratos: 'abc' }, expected: [], dateColumn: 'data_base_report' },
    { name: 'numeric value for the source table', schema: { contratos: 5 }, expected: [], dateColumn: 'data_base_report' },
    { name: 'boolean value for the source table', schema: { contratos: true }, expected: [], dateColumn: 'data_base_report' },
  ];

  it.each(fixedCrashes)('FIXED CRASH: $name', async ({ schema, expected, dateColumn }) => {
    await expect(runAsOnMain({ schema })).rejects.toBeInstanceOf(TypeError);

    const now = await runNow({ schema });

    expect(now.unavailableFields).toEqual(expected);
    expect(now.sql[0]).toContain(`SELECT DISTINCT \`${dateColumn}\` AS data_base_report`);
  });

  /**
   * Intended changes. Main did not throw on these, but only because it read a
   * malformed value as if it were valid: an array or `true` stringified into a
   * column name, an array's indexes or a nested object's keys reported as
   * unavailable fields. The write side (`ClientSchema`) never produces them.
   */
  const tightened: Array<{ name: string; schema: unknown; mainDateColumn: string; mainUnavailable: string[] }> = [
    {
      name: 'INTENDED: array column value is no longer stringified into a column',
      schema: { contratos: { data_base_report: ['dt_ref'] } },
      mainDateColumn: 'dt_ref',
      mainUnavailable: [],
    },
    {
      name: 'INTENDED: true column value no longer becomes the column `true`',
      schema: { contratos: { data_base_report: true } },
      mainDateColumn: 'true',
      mainUnavailable: [],
    },
    {
      name: 'INTENDED: an array table no longer reports its indexes as unavailable',
      schema: { contratos: [null] },
      mainDateColumn: 'data_base_report',
      mainUnavailable: ['0'],
    },
    {
      name: 'INTENDED: an array schema no longer reports nested keys as unavailable',
      schema: [{ saldo_devedor: null }],
      mainDateColumn: 'data_base_report',
      mainUnavailable: ['saldo_devedor'],
    },
  ];

  it.each(tightened)('$name', async ({ schema, mainDateColumn, mainUnavailable }) => {
    const before = await runAsOnMain({ schema });
    expect(before.sql[0]).toContain(`SELECT DISTINCT \`${mainDateColumn}\` AS data_base_report`);
    expect(before.unavailableFields).toEqual(mainUnavailable);

    const now = await runNow({ schema });

    expect(now.sql[0]).toContain('SELECT DISTINCT `data_base_report` AS data_base_report');
    expect(now.unavailableFields).toEqual([]);
  });
});

describe('parseClientDoc: legacy schema map', () => {
  it('keeps a valid map as is, without warning', () => {
    const schema = { contratos: { data_base_report: 'dt_ref', projeto: null }, pagamentos: {} };

    const lookup = parseClientDoc(nextClientId(), { schema });

    expect(lookup.schema).toEqual(schema);
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops only the malformed tables and columns and logs their paths, never the values', () => {
    const clientId = nextClientId();

    const lookup = parseClientDoc(clientId, {
      schema: { contratos: { data_base_report: 'dt_ref', projeto: ['secret-col'], saldo_devedor: null }, pagamentos: 'secret-table' },
    });

    expect(lookup.schema).toEqual({ contratos: { data_base_report: 'dt_ref', saldo_devedor: null } });
    const [line] = warn.mock.calls.map(([entry]) => JSON.parse(String(entry)));
    expect(line).toEqual(
      expect.objectContaining({ clientId, droppedPaths: ['schema.contratos.projeto', 'schema.pagamentos'] }),
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('secret-col');
    expect(logged).not.toContain('secret-table');
  });

  it('drops a schema that is not an object', () => {
    const lookup = parseClientDoc(nextClientId(), { schema: [{ saldo_devedor: null }] });

    expect(lookup.schema).toBeUndefined();
    expect(JSON.parse(String(warn.mock.calls[0]?.[0])).droppedPaths).toEqual(['schema']);
  });

  it('treats a null schema as absent, without warning', () => {
    expect(parseClientDoc(nextClientId(), { schema: null }).schema).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
