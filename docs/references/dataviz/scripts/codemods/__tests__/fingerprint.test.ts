import { describe, it, expect } from 'vitest';
import { compareFingerprints, fingerprintSource, type RenamePairs } from '../fingerprint';

const noRenames: RenamePairs = { names: new Map(), properties: new Map() };

const compare = (before: string, after: string, renames: RenamePairs = noRenames, file = 'src/x.tsx') =>
  compareFingerprints(fingerprintSource(file, before), fingerprintSource(file, after), renames).map((v) => `${v.kind} ${v.change}`);

describe('fingerprintSource', () => {
  it('collects literals, template text, JSX text and keys, and skips module specifiers', () => {
    const text = [
      "import { a } from './mod';",
      "vi.mock('@/shared/x', () => ({}));",
      "const label = 'Saldo';",
      'const sql = `SELECT ${a} FROM t`;',
      'const row = { nome: 1, "total geral": 2 };',
      'const { valor } = row;',
      'const node = <Card titulo="x">Olá</Card>;',
      'type T = { campo: string };',
    ].join('\n');
    const print = fingerprintSource('src/x.tsx', text);
    expect(print.literals).toEqual(['Saldo', 'SELECT ', 'x', ' FROM t'].sort());
    expect(print.jsxText).toEqual(['Olá']);
    expect(print.keys).toEqual(['campo', 'nome', 'titulo', 'total geral', 'valor'].sort());
  });

  it('keeps test titles apart from other literals', () => {
    const print = fingerprintSource('src/x.test.ts', "describe('grava', () => { it.skip('salva', () => use('x')); });");
    expect(print.testTitles).toEqual(['grava', 'salva']);
    expect(print.literals).toEqual(['x']);
  });
});

describe('compareFingerprints', () => {
  it('passes a pure local rename', () => {
    expect(compare('const larguraTotal = 1; use(larguraTotal);', 'const totalWidth = 1; use(totalWidth);')).toEqual([]);
  });

  it('fails when a string literal changes', () => {
    expect(compare("const a = 'antes do ponto';", "const a = 'previous do ponto';")).toEqual([
      'literal -1 "antes do ponto"',
      'literal +1 "previous do ponto"',
    ]);
  });

  it('fails when a property key changes outside the map', () => {
    expect(compare('const block = { etapa: 1 };', 'const block = { stage: 1 };')).toEqual(['key -1 "etapa"', 'key +1 "stage"']);
  });

  it('passes a property rename listed in the map', () => {
    const renames: RenamePairs = { names: new Map([['largura', 'width']]), properties: new Map([['largura', 'width']]) };
    expect(compare('const b = { largura: 1 }; b.largura;', 'const b = { width: 1 }; b.width;', renames)).toEqual([]);
  });

  it('keeps a persisted key when a shorthand local is renamed', () => {
    expect(compare('const etapa = 1; save({ etapa });', 'const stage = 1; save({ etapa: stage });')).toEqual([]);
  });

  it('accepts an identifier-reference string renamed by the map', () => {
    const renames: RenamePairs = { names: new Map([['gravaMetrica', 'saveMetric']]), properties: new Map() };
    expect(compare("vi.spyOn(mod, 'gravaMetrica');", "vi.spyOn(mod, 'saveMetric');", renames)).toEqual([]);
  });

  it('fails when JSX text changes', () => {
    expect(compare('const n = <p>Largura</p>;', 'const n = <p>Width</p>;')).toEqual(['jsx-text -1 "Largura"', 'jsx-text +1 "Width"']);
  });

  it('ignores keys inside vi.mock factories, but not the literals there', () => {
    expect(compare("vi.mock('./m', () => ({ gravaMetrica: 1 }));", "vi.mock('./m', () => ({ saveMetric: 1 }));")).toEqual([]);
    expect(compare("vi.mock('./m', () => ({ a: 'x' }));", "vi.mock('./m', () => ({ a: 'y' }));")).toEqual(['literal -1 "x"', 'literal +1 "y"']);
  });

  it('ignores module specifier changes from file renames', () => {
    expect(compare("import { a } from './serie-do-kpi';", "import { a } from './kpi-series';")).toEqual([]);
  });

  it('lets a test title follow a renamed compound identifier, but not a renamed plain word', () => {
    const renames: RenamePairs = { names: new Map([['serieDoKpi', 'kpiSeries'], ['nome', 'name']]), properties: new Map() };
    expect(compare("describe('serieDoKpi — recusas', () => {});", "describe('kpiSeries — recusas', () => {});", renames)).toEqual([]);
    expect(compare("it('usa o nome', () => {});", "it('usa o name', () => {});", renames)).toEqual([
      'test-title -1 "usa o nome"',
      'test-title +1 "usa o name"',
    ]);
  });

  it('passes a renamed rest element, which names a local and not a key', () => {
    expect(compare('const { a, ...resto } = x; use(resto);', 'const { a, ...rest } = x; use(rest);')).toEqual([]);
  });

  it('passes a renamed binding under a computed key', () => {
    expect(compare('const { [k]: descartado, ...rest } = x;', 'const { [k]: discarded, ...rest } = x;')).toEqual([]);
  });
});
