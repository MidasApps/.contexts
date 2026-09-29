import { describe, it, expect } from 'vitest';
import { createWordClassifier } from '../identifier-words';
import { portugueseWordsInFileName, scanSource, type ScanContext } from '../scan-identifiers';

const classifier = createWordClassifier({
  minWordLength: 3,
  shortPortuguese: [],
  domainTerms: ['ltv'],
  portuguese: ['largura', 'bloco', 'valor', 'nome', 'etapa', 'horizonte', 'saldo', 'devedor', 'serie', 'aviso'],
});

const context: ScanContext = {
  classifier,
  contractNames: new Set(['nome', 'saldo_devedor']),
  protectedNames: new Set(['etapa']),
  toolFolders: ['src/features/ai-agents/tools/'],
};

const scan = (text: string, file = 'src/x.ts') =>
  scanSource({ file, text }, context).map((o) => `${o.name}:${o.category}`);

describe('scanSource', () => {
  it('classifies locals, properties and imports', () => {
    const text = [
      "import { larguraBloco } from './blocks';",
      'const valorTotal = larguraBloco + 1;',
      'type Bloco = { largura: number };',
      'const block = { largura: valorTotal };',
      'const width = block.largura;',
    ].join('\n');
    expect(scan(text)).toEqual([
      'larguraBloco:local', 'valorTotal:local', 'larguraBloco:local', 'Bloco:local', 'largura:property',
      'largura:property', 'valorTotal:local', 'largura:property',
    ]);
  });

  it('never reads comments, strings, template text or JSX text', () => {
    const text = [
      '// largura do bloco',
      "const title = 'largura do bloco';",
      'const sql = `SELECT largura FROM bloco`;',
      'const node = <p>largura</p>;',
    ].join('\n');
    expect(scan(text, 'src/x.tsx')).toEqual([]);
  });

  it('protects data keys, protected names and contract names', () => {
    const text = [
      "const row = { saldo_devedor: 1, 'Saldo Devedor': 2 };",
      'const step = { etapa: 1 };',
      'const person = { nome: "x" };',
    ].join('\n');
    expect(scan(text)).toEqual(['saldo_devedor:data-key', 'Saldo Devedor:data-key', 'etapa:protected', 'nome:contract']);
  });

  it('marks zod params in tool folders as tool-param, but not elsewhere', () => {
    const text = 'const inputSchema = z.object({ horizonte: z.number() });';
    expect(scan(text, 'src/features/ai-agents/tools/forecast.ts')).toEqual(['horizonte:tool-param']);
    expect(scan(text, 'src/shared/lib/x.ts')).toEqual(['horizonte:property']);
  });

  it('treats a shorthand destructured name as a local, and a renamed key as a property', () => {
    expect(scan('const { aviso } = result;')).toEqual(['aviso:local']);
    expect(scan('const { aviso: warning } = result;')).toEqual(['aviso:property']);
  });

  it('marks declarations, not references or imports', () => {
    const text = [
      "import { larguraBloco } from './blocks';",
      'const valorTotal = larguraBloco + 1;',
      'type Bloco = { largura: number };',
      'use(valorTotal, { largura: 1 });',
    ].join('\n');
    const declared = scanSource({ file: 'src/x.ts', text }, context)
      .map((o) => `${o.name}:${o.isDeclaration ? 'decl' : 'ref'}`);
    expect(declared).toEqual([
      'larguraBloco:ref', 'valorTotal:decl', 'larguraBloco:ref', 'Bloco:decl', 'largura:decl', 'valorTotal:ref', 'largura:decl',
    ]);
  });

  it('reports the line and whether the name mixes languages', () => {
    const [occurrence] = scanSource({ file: 'src/x.ts', text: '\nconst larguraField = 1;' }, context);
    expect(occurrence).toMatchObject({ line: 2, isMixed: true, portugueseWords: ['largura'] });
  });
});

describe('portugueseWordsInFileName', () => {
  it.each([
    ['src/shared/lib/metrics/serie-do-kpi.ts', ['serie']],
    ['src/shared/lib/metrics/__tests__/serie-do-kpi.test.ts', ['serie']],
    ['src/shared/lib/metrics/kpi-series.ts', []],
  ])('%s', (file, words) => {
    expect(portugueseWordsInFileName(file, classifier)).toEqual(words);
  });
});
