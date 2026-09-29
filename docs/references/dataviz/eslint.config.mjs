import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
// Registrado EXPLICITAMENTE, e declarado em devDependencies. Antes o config
// usava as regras `react-hooks/*` contando que o eslint-config-next
// registrasse o plugin transitivamente. Quando a árvore do pnpm foi
// re-resolvida, o plugin deixou de estar alcançável e o `pnpm lint` passou a
// sair com exit 2 — gate morto, sem ninguém perceber, com eslint-disable
// espalhado que ninguém mais validava.
import reactHooks from 'eslint-plugin-react-hooks';
import englishIdentifiers from './eslint-rules/english-identifiers.mjs';

// Next 16 removeu `next lint`; eslint-config-next 16 exporta flat configs nativos
// (ESLint 9), então compomos diretamente — sem FlatCompat.
const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      '.mastra/**',
      'next-env.d.ts',
      'adrs/**',
      'docs/**',
      'scripts/**',
      // Harness DDC: hooks são .cjs por exigência do runtime de hook, e as
      // convenções são markdown. Nada aqui é código do produto.
      '.claude/**',
      '.contexts/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Adoção em etapas do plugin react-hooks (regras do React Compiler).
    // As regras de OTIMIZAÇÃO ficam como `warn` (visíveis, não bloqueiam o CI)
    // enquanto a base é migrada incrementalmente — refatorar a camada de dados
    // sem cobertura de teste seria risco de regressão. A regra de CORREÇÃO
    // `react-hooks/rules-of-hooks` permanece como `error`.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      // Convenção do projeto: prefixo `_` marca binding intencionalmente não usado.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Identificadores em inglês (`.contexts/engineering/rules/development.md`,
    // "Idioma dos identificadores"). `scripts/**` fica fora do lint global; lá a
    // mesma regra roda pelo teste `eslint-rules/__tests__/scripts-guard.test.ts`.
    files: ['src/**/*.{ts,tsx,js,mjs}', 'app/**/*.{ts,tsx,js,mjs}'],
    plugins: { local: { rules: { 'english-identifiers': englishIdentifiers } } },
    rules: { 'local/english-identifiers': 'error' },
  },
];

export default eslintConfig;
