import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * As tools analíticas caem para um cálculo empírico quando o BQML falha e
 * devolvem ao modelo, em `bqml_error`, o porquê. Esse texto é a mensagem do
 * BigQuery — traz id de projeto, e-mail de service account e nome de tabela.
 * Todo `bqml_error` passa por `formatToolError`, como o `error` do catch.
 */
const TOOLS_DIR = join(process.cwd(), 'src/features/ai-agents/tools');

const toolFiles = (): string[] => {
  return readdirSync(TOOLS_DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && !f.endsWith('.test.ts'));
};

describe('bqml_error devolvido ao modelo', () => {
  it('always goes through formatToolError', () => {
    const rawLines = toolFiles().flatMap((f) =>
      readFileSync(join(TOOLS_DIR, f), 'utf8')
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => /\bbqml_error\s*:/.test(line) && !/formatToolError\(/.test(line)),
    );

    expect(rawLines.map(({ f, i, line }) => `${f}:${i} ${line.trim()}`)).toEqual([]);
  });

  /** As tools `bqml.*` relançavam o erro do BigQuery como veio. */
  it('no tool rethrows a caught error as it came', () => {
    const rawLines = toolFiles().flatMap((f) =>
      readFileSync(join(TOOLS_DIR, f), 'utf8')
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => /\bthrow\s+(?:err|error|e)\s*;/.test(line)),
    );

    expect(rawLines.map(({ f, i, line }) => `${f}:${i} ${line.trim()}`)).toEqual([]);
  });

  it('finds the tools it guards', () => {
    const withBqmlError = toolFiles().filter((f) => /\bbqml_error\s*:/.test(readFileSync(join(TOOLS_DIR, f), 'utf8')));
    expect(withBqmlError.length).toBeGreaterThanOrEqual(11);
  });
});
