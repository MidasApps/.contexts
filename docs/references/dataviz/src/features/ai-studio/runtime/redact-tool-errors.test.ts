import { describe, it, expect } from 'vitest';
import { withRedactedErrors } from './redact-tool-errors';

const RAW_ERROR = 'Not found: Dataset white-smile-508914-q2:dataviz_bqml_x; caller sa@white-smile-508914-q2.iam.gserviceaccount.com';

const drain = async (it: AsyncIterable<unknown>): Promise<unknown[]> => {
  const out: unknown[] = [];
  for await (const v of it) out.push(v);
  return out;
};

describe('withRedactedErrors', () => {
  it('redacts an async rejection', async () => {
    const tool = withRedactedErrors({ description: 'x', execute: async () => { throw new Error(RAW_ERROR); } });
    await expect(tool.execute()).rejects.toThrow(/\[project\]/);
    await expect(tool.execute()).rejects.not.toThrow(/white-smile|sa@/);
  });

  it('redacts a synchronous throw', async () => {
    const tool = withRedactedErrors({ execute: () => { throw new Error(RAW_ERROR); } });
    expect(() => tool.execute()).toThrow(/\[project\]/);
  });

  it('keeps the normal result untouched', async () => {
    const tool = withRedactedErrors({ description: 'd', execute: async (x: unknown) => ({ ok: x }) });
    await expect(tool.execute(1)).resolves.toEqual({ ok: 1 });
    expect(tool.description).toBe('d');
  });

  it('keeps a generator a generator and redacts what it throws midway', async () => {
    const tool = withRedactedErrors({
      async *execute() {
        yield { etapa: 1 };
        throw new Error(RAW_ERROR);
      },
    });
    const it = tool.execute() as AsyncIterable<unknown>;
    expect(typeof it[Symbol.asyncIterator]).toBe('function');
    const seen: unknown[] = [];
    await expect((async () => { for await (const v of it) seen.push(v); })()).rejects.toThrow(/\[project\]/);
    expect(seen).toEqual([{ etapa: 1 }]);
  });

  it('passes a generator\'s values through', async () => {
    const tool = withRedactedErrors({ async *execute() { yield 1; yield 2; } });
    expect(await drain(tool.execute() as AsyncIterable<unknown>)).toEqual([1, 2]);
  });

  it('leaves a tool without execute alone', () => {
    const t = { description: 'sem execute' };
    expect(withRedactedErrors(t)).toBe(t);
  });
});

/**
 * `kb_retrieval` e as tools de autoria do supervisor eram montadas fora do
 * registry e escapavam da redação. Todo arquivo que monta um `Agent` com
 * tools precisa passá-las por `withRedactedErrors` (direto ou via
 * `buildToolsFromKeys`, que aplica).
 */
describe('agentes montados com tools', () => {
  it('route every tool through withRedactedErrors', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const listSourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return n === 'node_modules' || n === '__tests__' ? [] : listSourceFiles(p);
      return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
    const unwrapped = ['src', 'app'].flatMap((d) => listSourceFiles(join(process.cwd(), d)))
      .filter((f) => {
        const source = readFileSync(f, 'utf8');
        return /new Agent\s*\(/.test(source) && /\btools\s*:/.test(source) && !/withRedactedErrors/.test(source);
      })
      .map((f) => f.replace(`${process.cwd()}/`, ''));
    expect(unwrapped).toEqual([]);
  });
});
