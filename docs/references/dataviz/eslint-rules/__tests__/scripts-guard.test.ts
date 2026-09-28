// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import nextTypescript from 'eslint-config-next/typescript';
import rule from '../english-identifiers.mjs';

/**
 * `pnpm lint` ignores `scripts/**`, so the English-identifiers rule reaches the
 * scripts through this test instead. Bindings only: seed payloads, templates
 * and synthetic data are full of Firestore and BigQuery keys, which are data.
 *
 * Excluded: the codemod itself (its fixtures are Portuguese on purpose) and
 * `onboarding-lote-2026-09/`, the documented exception in
 * `.contexts/engineering/rules/development.md`.
 */
const parser = nextTypescript.find((config) => config.languageOptions?.parser)?.languageOptions?.parser;

describe('scripts/ — English identifiers', () => {
  it('declares no Portuguese binding', async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [
        { ignores: ['scripts/codemods/**', 'scripts/onboarding-lote-2026-09/**'] },
        // Only this rule runs here; other rules' disable comments are not ours to judge.
        { linterOptions: { reportUnusedDisableDirectives: 'off' } },
        { files: ['**/*.{ts,mts,mjs,js}'], languageOptions: { parser, ecmaVersion: 'latest', sourceType: 'module' } },
        {
          plugins: { local: { rules: { 'english-identifiers': rule } } },
          rules: { 'local/english-identifiers': ['error', { checkKeys: false }] },
        },
      ],
    });
    const results = await eslint.lintFiles(['scripts/**/*.{ts,mjs}']);
    const problems = results.flatMap((result) =>
      result.messages.filter((m) => m.ruleId === 'local/english-identifiers').map((m) => `${result.filePath.replace(`${process.cwd()}/`, '')}:${m.line} ${m.message}`),
    );
    expect(problems).toEqual([]);
  }, 120_000);
});
