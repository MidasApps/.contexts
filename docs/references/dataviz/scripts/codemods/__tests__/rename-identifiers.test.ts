import ts from '@typescript/typescript6';
import { describe, it, expect } from 'vitest';
import { compareFingerprints, fingerprintSource } from '../fingerprint';
import { createEditableProject, type EditableProject } from '../language-service';
import { renameFile } from '../rename-file';
import { renameIdentifier } from '../rename-identifiers';
import type { RenameMapEntry, RenamePolicy } from '../rename-types';

const ROOT = '/virtual';

const policy: RenamePolicy = {
  repoRoot: ROOT,
  protectedNames: new Set(['etapa']),
  excludedFolders: ['scripts/onboarding-lote-2026-09/'],
};

const project = (files: Record<string, string>): EditableProject => {
  const virtualFiles = new Map(Object.entries(files).map(([name, text]) => [`${ROOT}/${name}`, text]));
  return createEditableProject({
    rootFiles: [...virtualFiles.keys()],
    currentDirectory: ROOT,
    virtualFiles,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      noEmit: true,
    },
  });
};

const entry = (overrides: Partial<RenameMapEntry> & Pick<RenameMapEntry, 'file' | 'line' | 'from' | 'to'>): RenameMapEntry => ({
  kind: 'local',
  persisted: false,
  needsAudit: false,
  ...overrides,
});

const text = (p: EditableProject, file: string): string | undefined => p.readText(`${ROOT}/${file}`);

describe('renameIdentifier', () => {
  it('renames a local across files', () => {
    const p = project({
      'src/blocks.ts': 'export const larguraBloco = 2;\n',
      'src/use.ts': "import { larguraBloco } from './blocks';\nexport const w = larguraBloco * 2;\n",
    });
    const result = renameIdentifier(p, entry({ file: 'src/blocks.ts', line: 1, from: 'larguraBloco', to: 'blockWidth' }), policy);
    expect(result.locations).toBe(3);
    expect(text(p, 'src/blocks.ts')).toBe('export const blockWidth = 2;\n');
    expect(text(p, 'src/use.ts')).toBe("import { blockWidth } from './blocks';\nexport const w = blockWidth * 2;\n");
  });

  it('aborts when the new name is already in scope, and changes nothing', () => {
    const source = 'const width = 1;\nconst largura = 2;\nexport const s = width + largura;\n';
    const p = project({ 'src/a.ts': source });
    expect(() => renameIdentifier(p, entry({ file: 'src/a.ts', line: 2, from: 'largura', to: 'width' }), policy))
      .toThrow(/width is already in scope/);
    expect(text(p, 'src/a.ts')).toBe(source);
  });

  it('allows shadowing an unused lib global, and refuses when the scope uses it', () => {
    const p = project({ 'src/a.ts': 'export const f = () => { const nome = 1; return nome; };\nexport const g = () => { const nome = 1; return nome + escape(\'x\').length; };\n' });
    renameIdentifier(p, entry({ file: 'src/a.ts', line: 1, from: 'nome', to: 'escape' }), policy);
    expect(text(p, 'src/a.ts')).toContain('const escape = 1; return escape;');
    expect(() => renameIdentifier(p, entry({ file: 'src/a.ts', line: 2, from: 'nome', to: 'escape' }), policy))
      .toThrow(/would shadow the global/);
  });

  it('keeps a shorthand key when the local is renamed, so the fingerprint holds', () => {
    const before = 'declare const save: (x: { passo: number }) => void;\nconst passo = 1;\nsave({ passo });\n';
    const p = project({ 'src/a.ts': before });
    renameIdentifier(p, entry({ file: 'src/a.ts', line: 2, from: 'passo', to: 'step' }), policy);
    const after = text(p, 'src/a.ts')!;
    expect(after).toContain('save({ passo: step });');
    const noRenames = { names: new Map<string, string>(), properties: new Map<string, string>() };
    expect(compareFingerprints(fingerprintSource('a.ts', before), fingerprintSource('a.ts', after), noRenames)).toEqual([]);
  });

  it('renames a property on its declaration, literals and accesses', () => {
    const p = project({ 'src/a.ts': 'type B = { largura: number };\nconst b: B = { largura: 1 };\nexport const w = b.largura;\n' });
    renameIdentifier(p, entry({ file: 'src/a.ts', line: 1, from: 'largura', to: 'width', kind: 'prop' }), policy);
    expect(text(p, 'src/a.ts')).toBe('type B = { width: number };\nconst b: B = { width: 1 };\nexport const w = b.width;\n');
  });

  it('skips an entry whose symbol an earlier entry already renamed', () => {
    const p = project({ 'src/a.ts': 'type B = { largura: number };\nconst b: B = { largura: 1 };\nexport const w = b.largura;\n' });
    renameIdentifier(p, entry({ file: 'src/a.ts', line: 1, from: 'largura', to: 'width', kind: 'prop' }), policy);
    const again = renameIdentifier(p, entry({ file: 'src/a.ts', line: 2, from: 'largura', to: 'width', kind: 'prop' }), policy);
    expect(again).toMatchObject({ locations: 0, alreadyApplied: true });
  });

  it('aborts a property rename when the type already has the new name', () => {
    const p = project({ 'src/a.ts': 'type B = { largura: number; width: number };\nconst b: B = { largura: 1, width: 2 };\nexport const w = b.largura;\n' });
    expect(() => renameIdentifier(p, entry({ file: 'src/a.ts', line: 3, from: 'largura', to: 'width', kind: 'prop' }), policy))
      .toThrow(/property width already exists/);
  });

  it.each([
    ['a persisted name', { persisted: true }, /persisted/],
    ['an unaudited property', { kind: 'prop' as const, needsAudit: true }, /not audited/],
    ['a protected name', { from: 'etapa' }, /protected/],
    ['an empty target', { to: '' }, /missing target/],
    ['an invalid identifier', { to: 'block-width' }, /valid identifier/],
    ['an excluded folder', { file: 'scripts/onboarding-lote-2026-09/seed.ts' }, /excluded folder/],
  ])('refuses %s', (_name, overrides, reason) => {
    const p = project({ 'src/a.ts': 'const largura = 1;\nconst etapa = 2;\n' });
    expect(() => renameIdentifier(p, entry({ file: 'src/a.ts', line: 1, from: 'largura', to: 'width', ...overrides }), policy))
      .toThrow(reason);
  });

  it('reports strings equal to the old name without changing them', () => {
    const p = project({
      'src/mod.ts': 'export const gravaMetrica = () => 1;\n',
      'src/mod.test.ts': "import * as mod from './mod';\ndeclare const vi: { spyOn: (a: unknown, b: string) => void };\nvi.spyOn(mod, 'gravaMetrica');\n",
    });
    const result = renameIdentifier(p, entry({ file: 'src/mod.ts', line: 1, from: 'gravaMetrica', to: 'saveMetric' }), policy);
    expect(result.stringHits).toEqual(['src/mod.test.ts:3']);
    expect(text(p, 'src/mod.test.ts')).toContain("vi.spyOn(mod, 'gravaMetrica')");
  });
});

describe('renameIdentifier — vi.mock factories', () => {
  it('renames the export key in factories that mock its module, and nothing else', () => {
    const p = project({
      'src/lib/metric.ts': 'export const gravaMetrica = () => 1;\n',
      'src/lib/metric.test.ts': [
        'declare const vi: { mock: (p: string, f: () => unknown) => void };',
        "vi.mock('./metric', () => ({ gravaMetrica: () => 2, nested: { gravaMetrica: 3 } }));",
        "vi.mock('./other', () => ({ gravaMetrica: () => 4 }));",
        '',
      ].join('\n'),
    });
    const result = renameIdentifier(p, entry({ file: 'src/lib/metric.ts', line: 1, from: 'gravaMetrica', to: 'saveMetric' }), policy);
    const test = text(p, 'src/lib/metric.test.ts')!;
    expect(test).toContain("vi.mock('./metric', () => ({ saveMetric: () => 2, nested: { gravaMetrica: 3 } }));");
    expect(test).toContain("vi.mock('./other', () => ({ gravaMetrica: () => 4 }));");
    expect(result.locations).toBe(2);
  });

  it('leaves factories alone when the renamed symbol is not exported', () => {
    const p = project({
      'src/lib/metric.ts': 'const gravaMetrica = () => 1;\nexport const run = gravaMetrica;\n',
      'src/lib/metric.test.ts': "declare const vi: { mock: (p: string, f: () => unknown) => void };\nvi.mock('./metric', () => ({ gravaMetrica: 1 }));\n",
    });
    renameIdentifier(p, entry({ file: 'src/lib/metric.ts', line: 1, from: 'gravaMetrica', to: 'saveMetric' }), policy);
    expect(text(p, 'src/lib/metric.test.ts')).toContain('gravaMetrica: 1');
  });
});

describe('renameFile', () => {
  it('moves the file and rewrites imports and vi.mock paths', () => {
    const p = project({
      'src/lib/serie-do-kpi.ts': 'export const a = 1;\n',
      'src/lib/use.ts': "import { a } from './serie-do-kpi';\nexport const b = a;\n",
      'src/lib/use.test.ts': "declare const vi: { mock: (p: string) => void };\nvi.mock('./serie-do-kpi');\nimport { b } from './use';\nexport const c = b;\n",
    });
    renameFile(p, entry({ file: 'src/lib/serie-do-kpi.ts', line: 0, from: 'src/lib/serie-do-kpi.ts', to: 'src/lib/kpi-series.ts', kind: 'file' }), policy);
    expect(text(p, 'src/lib/serie-do-kpi.ts')).toBeUndefined();
    expect(text(p, 'src/lib/kpi-series.ts')).toBe('export const a = 1;\n');
    expect(text(p, 'src/lib/use.ts')).toContain("from './kpi-series'");
    expect(text(p, 'src/lib/use.test.ts')).toContain("vi.mock('./kpi-series')");
    expect(p.movedFiles()).toEqual([[`${ROOT}/src/lib/serie-do-kpi.ts`, `${ROOT}/src/lib/kpi-series.ts`]]);
  });

  it('refuses to overwrite an existing file', () => {
    const p = project({ 'src/a.ts': 'export const a = 1;\n', 'src/b.ts': 'export const b = 1;\n' });
    expect(() => renameFile(p, entry({ file: 'src/a.ts', line: 0, from: 'src/a.ts', to: 'src/b.ts', kind: 'file' }), policy))
      .toThrow(/already exists/);
  });
});
