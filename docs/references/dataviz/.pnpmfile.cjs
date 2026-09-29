// Hook do pnpm (lido em todo `pnpm install`; o checksum fica no lockfile).
//
// Por quê: o TypeScript 7 (port nativo em Go) não expõe API programática — o
// `typescript@7` exporta só `version`. O typescript-eslint importa a API do
// compilador para parsear TS e quebra ao carregar (`reading 'Cjs'`). Nenhuma
// versão do typescript-eslint suporta TS 7 (peer `typescript <6.1.0`, inclusive
// no canary), e o parser precisa da API mesmo sem lint type-aware. O mesmo vale
// para o `typescript-paths`, que o CLI do Mastra (`mastra dev`/`mastra build`,
// via `@mastra/deployer`) usa para resolver os aliases do tsconfig: sem a API
// ele quebra em `createHandler` (`reading 'getCurrentDirectory'`).
//
// O que faz: SÓ nesses pacotes, troca o peer `typescript` por
// uma dependência própria no `@typescript/typescript6` — o pacote de
// compatibilidade da Microsoft para ferramentas que precisam da API do TS 6 ao
// lado do TS 7. O `typescript` do projeto continua 7: `tsc`, `next build` e o
// editor não mudam. (`overrides` e `packageExtensions` não servem: o pnpm
// resolve peer pelo pai, e o pai é a raiz com TS 7.)
//
// Remover quando o typescript-eslint e o typescript-paths suportarem TS 7 (API
// prevista no TS 7.1+).
// Ver `.contexts/engineering/stacks/language/typescript@7.md`.
const TS6_API = 'npm:@typescript/typescript6@6.0.2';

const NEEDS_TS6_API = new Set([
  // typescript-eslint
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  '@typescript-eslint/project-service',
  '@typescript-eslint/tsconfig-utils',
  '@typescript-eslint/type-utils',
  '@typescript-eslint/typescript-estree',
  '@typescript-eslint/utils',
  'typescript-eslint',
  'ts-api-utils',
  // CLI do Mastra (@mastra/deployer) — playground local
  'typescript-paths',
]);

function readPackage(pkg) {
  if (NEEDS_TS6_API.has(pkg.name) && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: TS6_API };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
