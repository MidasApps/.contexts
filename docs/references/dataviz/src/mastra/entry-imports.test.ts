import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A guarda de banco só protege se nada que abre Firestore/BigQuery for carregado
 * antes dela. A entry e o módulo de config podem importar estaticamente APENAS
 * o que está aqui; os agentes entram por `import()` depois da guarda.
 */
const ALLOWED_STATIC_IMPORTS: Record<string, string[]> = {
  'src/mastra/index.ts': ['@mastra/core', '@mastra/core/server', './playground-config', './loopback-guard'],
  'src/mastra/playground-config.ts': ['../../scripts/lib/production-guard.mjs', '@/shared/lib/runtime-config'],
  'src/mastra/loopback-guard.ts': [],
};

const staticImports = (source: string): string[] =>
  [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm), ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)]
    .map((match) => match[1] ?? '');

describe('playground entry loads nothing that touches GCP before the guard', () => {
  it.each(Object.entries(ALLOWED_STATIC_IMPORTS))('%s imports only its allow-list', (file, allowed) => {
    const source = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    expect(staticImports(source).filter((spec) => !allowed.includes(spec))).toEqual([]);
  });

  it('runtime-config has no imports (no side effects before the guard)', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/shared/lib/runtime-config.ts'), 'utf8');
    expect(staticImports(source)).toEqual([]);
  });
});
