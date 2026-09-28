// @vitest-environment node
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import nextTypescript from 'eslint-config-next/typescript';
import rule from '../english-identifiers.mjs';

// RuleTester runs its cases through describe/it; hand it vitest's.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// The TypeScript parser the project lints with (it comes in through
// eslint-config-next), so interfaces and type members parse as in `pnpm lint`.
const parser = nextTypescript.find((config) => config.languageOptions?.parser)?.languageOptions?.parser;

const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 'latest', sourceType: 'module' },
});

tester.run('english-identifiers', rule, {
  valid: [
    // snake_case is a data name (BigQuery column, Firestore field).
    'const saldo_devedor = 1;',
    // Keys the migration keeps: persisted block fields, tool result keys,
    // metric output columns, contract vocabulary, the reviewed allowlist.
    'const block = { legendaInterativa: true, etapas: [], ordem: 1 };',
    "const result = { recusa: true, motivo: 'x' };",
    'const row = { etapa: 1, origem: 2, destino: 3 };',
    'const filters = { faixaLtv: [], tipoProponente: [] };',
    'type Payload = { substituiBlockId?: string; safraWindowEnd?: string };',
    // A local that carries a protected key keeps its name, as in the codemod.
    'const recusa = refuse(); const result = { recusa };',
    // Strings are data, never identifiers.
    "const label = 'Saldo Devedor';",
    "const tones = { 'Válida': 'success' };",
    // Domain acronyms and locale tags are not Portuguese vocabulary.
    'const pdd = 1; const ltv = 2; const vgv = 3;',
    'export const numberFormatPtBr = (value) => value;',
    // English words that also look Portuguese stay English.
    'const MIN_ROW_HEIGHT = 1; const showsTotal = true; const STATES = [];',
    { code: 'const x = { larguraMinima: 1 };', options: [{ checkKeys: false }] },
  ],
  invalid: [
    {
      code: 'const calculaTotal = () => 1;',
      errors: [{ messageId: 'portugueseBinding', data: { name: 'calculaTotal', words: 'calcula' } }],
    },
    {
      code: 'interface EstadoDoBloco { value: number }',
      errors: [{ messageId: 'portugueseBinding' }],
    },
    {
      code: 'const x = { larguraMinima: 1 };',
      errors: [{ messageId: 'portugueseKey', data: { name: 'larguraMinima', words: 'largura, minima' } }],
    },
    {
      code: 'type Options = { formataValor: (v: number) => string };',
      errors: [{ messageId: 'portugueseKey' }],
    },
    {
      code: 'function run({ horizonte }) { return horizonte; }',
      errors: [{ messageId: 'portugueseBinding', data: { name: 'horizonte', words: 'horizonte' } }],
    },
    {
      code: "import { valorTotal } from './x';",
      errors: [{ messageId: 'portugueseBinding' }],
    },
    {
      code: 'class Relatorio {}',
      errors: [{ messageId: 'portugueseBinding' }],
    },
    {
      code: 'try { run(); } catch (erro) { report(erro); }',
      errors: [{ messageId: 'portugueseBinding' }],
    },
  ],
});
