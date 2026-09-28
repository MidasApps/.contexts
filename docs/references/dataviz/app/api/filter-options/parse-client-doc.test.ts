import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { parseClientDoc } from './parse-client-doc';
import { matchClientDataset } from './match-client-dataset';
import { resolveDateSource } from './date-source';

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

// The warning is deduplicated per process, so each test uses its own client id.
let clientSeq = 0;
const nextClientId = () => `client-${++clientSeq}`;

const DS = 'proj.ds';
const goodBinding = {
  dataSourceId: 'proj',
  datasetId: 'ds',
  tableBindings: { contratos: 'tb' },
  schemaBindings: { 'contratos.data_base_report': 'dt' },
};
const boundSource = { table: 'tb', dateField: 'dt', projectField: null };

const loggedEntries = () => warn.mock.calls.map(([line]) => JSON.parse(String(line)));

describe('parseClientDoc', () => {
  it('keeps the dataset fields of a valid document without warning', () => {
    const raw = {
      name: 'Vila Rosa',
      dataset: 'proj.legacy',
      datasets: [{ dataset: 'proj.other' }],
      productBindings: [
        {
          productId: 'covenants',
          datasets: [{ ...goodBinding, schemaBindings: { 'contratos.data_base_report': 'dt', 'contratos.projeto': null } }],
        },
      ],
    };

    const result = parseClientDoc(nextClientId(), raw);

    expect(result).toEqual({
      dataset: 'proj.legacy',
      datasets: [{ dataset: 'proj.other' }],
      productBindings: [
        {
          datasets: [
            {
              dataSourceId: 'proj',
              datasetId: 'ds',
              tableBindings: { contratos: 'tb' },
              schemaBindings: { 'contratos.data_base_report': 'dt', 'contratos.projeto': null },
            },
          ],
        },
      ],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops productBindings that is not an array and keeps the legacy fields', () => {
    const result = parseClientDoc(nextClientId(), { dataset: DS, productBindings: { datasets: [] } });

    expect(result.productBindings).toBeUndefined();
    expect(result.dataset).toBe(DS);
  });

  it('keeps a valid legacy dataset entry when a sibling entry is malformed', () => {
    const lookup = parseClientDoc(nextClientId(), { datasets: ['x', { dataset: 1 }, null, { dataset: DS }] });

    expect(lookup.datasets).toEqual([{ dataset: DS }]);
    expect(matchClientDataset(lookup, DS)).toBe(true);
  });

  it('keeps a valid binding when a sibling product or binding is malformed', () => {
    const lookup = parseClientDoc(nextClientId(), {
      productBindings: [{ datasets: 'abc' }, null, { datasets: [{ datasetId: 7 }, null, goodBinding] }, { datasets: {} }],
    });

    expect(matchClientDataset(lookup, DS)).toBe(true);
    expect(resolveDateSource(lookup, DS)).toEqual(boundSource);
  });

  it('never lets malformed tableBindings or schemaBindings change the match', () => {
    const malformedMaps = [
      { tableBindings: { contratos: 'tb', pagamentos: null } },
      { tableBindings: 'tb' },
      { schemaBindings: ['a'] },
      { schemaBindings: { 'contratos.data_base_report': 42 } },
    ];

    for (const malformed of malformedMaps) {
      const lookup = parseClientDoc(nextClientId(), { productBindings: [{ datasets: [{ ...goodBinding, ...malformed }] }] });
      expect(matchClientDataset(lookup, DS)).toBe(true);
    }
  });

  it('drops only the malformed map entry and keeps the rest of the binding', () => {
    const lookup = parseClientDoc(nextClientId(), {
      productBindings: [{ datasets: [{ ...goodBinding, tableBindings: { contratos: 'tb', pagamentos: null } }] }],
    });

    expect(lookup.productBindings?.[0]?.datasets?.[0]?.tableBindings).toEqual({ contratos: 'tb' });
    expect(resolveDateSource(lookup, DS)).toEqual(boundSource);
  });

  it('logs one JSON line with the client id and dropped paths, never the values', () => {
    const clientId = nextClientId();

    parseClientDoc(clientId, { name: 'Secret Name', productBindings: [{ datasets: [{ datasetId: 'garbage-id', dataSourceId: 9 }] }] });

    expect(loggedEntries()).toEqual([
      expect.objectContaining({
        severity: 'WARNING',
        component: 'filter-options',
        clientId,
        droppedPaths: ['productBindings[0].datasets[0].dataSourceId'],
      }),
    ]);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('Secret Name');
    expect(logged).not.toContain('garbage-id');
  });

  it('warns once per client and dropped paths in the same process', () => {
    const clientId = nextClientId();
    const raw = { productBindings: 'garbage' };

    parseClientDoc(clientId, raw);
    parseClientDoc(clientId, raw);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns an empty lookup when the document is not an object', () => {
    expect(parseClientDoc(nextClientId(), undefined)).toEqual({});
  });
});

/**
 * Old-vs-new equivalence on the shapes from the PR review. `matchedBefore` is
 * what `matchClientDataset(raw)` returned at f880e0f (`throws` = it threw).
 * Every shape that matched before must still match the same dataset, and none
 * may start matching.
 */
describe('parseClientDoc + matchClientDataset: equivalence with the raw-document matcher', () => {
  const shapes: Array<{ name: string; raw: unknown; matchedBefore: boolean | 'throws' }> = [
    { name: 'legacy dataset', raw: { dataset: DS }, matchedBefore: true },
    { name: 'legacy datasets', raw: { datasets: [{ dataset: DS }] }, matchedBefore: true },
    { name: 'valid binding', raw: { productBindings: [{ datasets: [goodBinding] }] }, matchedBefore: true },
    { name: 'legacy datasets with a string entry', raw: { datasets: ['x', { dataset: DS }] }, matchedBefore: true },
    { name: 'legacy datasets with a numeric dataset', raw: { datasets: [{ dataset: 1 }, { dataset: DS }] }, matchedBefore: true },
    {
      name: 'binding with a null tableBindings value',
      raw: { productBindings: [{ datasets: [{ ...goodBinding, tableBindings: { contratos: 'tb', pagamentos: null } }] }] },
      matchedBefore: true,
    },
    {
      name: 'valid product next to a product with object datasets',
      raw: { productBindings: [{ datasets: [goodBinding] }, { datasets: {} }] },
      matchedBefore: true,
    },
    {
      name: 'sibling binding with a numeric datasetId',
      raw: { productBindings: [{ datasets: [{ datasetId: 7 }, goodBinding] }] },
      matchedBefore: true,
    },
    {
      name: 'binding with array schemaBindings',
      raw: { productBindings: [{ datasets: [{ ...goodBinding, schemaBindings: ['a'] }] }] },
      matchedBefore: true,
    },
    {
      name: 'product with string datasets next to a valid product',
      raw: { productBindings: [{ datasets: 'abc' }, { datasets: [goodBinding] }] },
      matchedBefore: true,
    },
    { name: 'legacy dataset with object productBindings', raw: { dataset: DS, productBindings: { datasets: [] } }, matchedBefore: true },
    { name: 'object productBindings only', raw: { productBindings: { datasets: [goodBinding] } }, matchedBefore: 'throws' },
    { name: 'numeric dataset with a valid binding', raw: { dataset: 5, productBindings: [{ datasets: [goodBinding] }] }, matchedBefore: true },
  ];

  it.each(shapes)('$name', ({ raw, matchedBefore }) => {
    const matchesNow = matchClientDataset(parseClientDoc(nextClientId(), raw), DS);

    expect(matchesNow).toBe(matchedBefore === true);
  });

  /**
   * Intended exceptions, found in the round-2 review. At f880e0f these shapes
   * matched (or picked a binding) only because the old matcher stringified
   * non-string ids (`${123}`, `${['proj']}`) or iterated a lone object as if it
   * were a list. Coercion has no place in a tenancy check, the write API
   * (ClientDoc) rejects these shapes, and no real client document has them, so
   * the tightening is deliberate. These rows pin the NEW behaviour.
   */
  const defaultSource = { table: 'contratos', dateField: 'data_base_report', projectField: 'projeto' };
  const tightened: Array<{ name: string; raw: unknown; requested: string; match: boolean; dateSource: object }> = [
    {
      name: 'INTENDED: numeric datasetId no longer matches via coercion',
      raw: { productBindings: [{ datasets: [{ ...goodBinding, datasetId: 123 }] }] },
      requested: 'proj.123',
      match: false,
      dateSource: defaultSource,
    },
    {
      name: 'INTENDED: array dataSourceId no longer matches via coercion',
      raw: { productBindings: [{ datasets: [{ dataSourceId: ['proj'], datasetId: 'ds' }] }] },
      requested: DS,
      match: false,
      dateSource: defaultSource,
    },
    {
      name: 'INTENDED: array datasetId no longer matches via coercion',
      raw: { productBindings: [{ datasets: [{ dataSourceId: 'proj', datasetId: ['ds'] }] }] },
      requested: DS,
      match: false,
      dateSource: defaultSource,
    },
    {
      name: 'INTENDED: numeric dataSourceId no longer matches via coercion',
      raw: { productBindings: [{ datasets: [{ dataSourceId: 123, datasetId: 'ds' }] }] },
      requested: '123.ds',
      match: false,
      dateSource: defaultSource,
    },
    {
      name: 'INTENDED: a single-object datasets is not read as a binding (legacy match kept, default source)',
      raw: { dataset: DS, productBindings: [{ datasets: goodBinding }] },
      requested: DS,
      match: true,
      dateSource: defaultSource,
    },
  ];

  it.each(tightened)('$name', ({ raw, requested, match, dateSource }) => {
    const lookup = parseClientDoc(nextClientId(), raw);

    expect(matchClientDataset(lookup, requested)).toBe(match);
    expect(resolveDateSource(lookup, requested)).toEqual(dateSource);
  });
});
