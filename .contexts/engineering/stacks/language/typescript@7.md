---
title: TypeScript
type: stacks
version: 7.0.2
last_updated: 2026-09-28
status: current
upstream: https://www.typescriptlang.org/docs/
supersedes: typescript@6
category: language
---

# TypeScript 7.x

Linguagem oficial do projeto. TypeScript 7 (GA em 2026-07-08) é o **port nativo em Go** do toolchain TypeScript: type-checking e language service tipicamente **8-12x mais rápidos** que TypeScript 6, com paralelização (`--checkers`, `--builders`) e menor uso de memória. Pin medido em 2026-09-28: **7.0.2**. A 7.1, que deve expor a API programática, ainda não estava no npm. A semântica de type-checking é compatível com TypeScript 6.0 (com `stableTypeOrdering` e sem `ignoreDeprecations`).

TypeScript 6 permanece o baseline de **API programática** (eslint, Volar, etc.) via pacote de compatibilidade. Código de aplicação e `tsc` do projeto usam TypeScript 7. O runtime JS/TS é `@stacks/runtime/node@26`.

## Baseline da release

- **Versão alvo do projeto**: TypeScript **7.x** (`typescript@7.0.2`, pin exato conforme `stacks/VERSIONS.md`).
- **Compatibilidade de tipos**: idêntica a TypeScript 6.0 estável (código limpo em TS 6 compila em TS 7).
- **Node para rodar `tsc`**: baseline do projeto é **Node 26** (Node 20 está em EOL) (ver `@stacks/runtime/node@26`).
- **`target`/`lib` baseline**: `ES2025` + `ESNext.Disposable` (`using`/`await using`) + `DOM`/`DOM.Iterable` (apps web), ou sem `DOM` (Node). `ES2025` cobre iterator helpers e métodos de `Set`.
- **Browser baseline implícito**: navegadores com suporte a ES2023+.
- **Pacote**: `typescript@7.0.2` em devDependencies; nunca em dependencies.

### Side-by-side com TypeScript 6 (tooling)

TS 7 **ainda não expõe API programática estável** (prevista em 7.1+). Ferramentas que importam `typescript` (typescript-eslint, Volar) precisam da API 6 ao lado.

**Canônico do projeto (Next.js 16.3+, ADR 0004 E2):**

- a raiz mantém `typescript@7.0.2` (`tsc` e `next build` no 7);
- só quem precisa da API 6 a recebe, via hook `readPackage` em `.pnpmfile.cjs`,
  trocando o peer `typescript` por dependência de
  `npm:@typescript/typescript6@<pin exato>` nos pacotes `@typescript-eslint/*`,
  `ts-api-utils` e `typescript-paths` (este último puxado pela CLI do Mastra via
  `@mastra/deployer`; recebendo TS 7 falha com
  `Cannot read properties of undefined (reading 'getCurrentDirectory')`);
- codemods/scripts que precisem do parser ou `LanguageService` usam
  `@typescript/typescript6` como devDependency direta — nunca em código de produção.

```js
// .pnpmfile.cjs
const NEEDS_TS6_API = new Set(["@typescript-eslint/parser", "@typescript-eslint/typescript-estree", "ts-api-utils", "typescript-paths" /* … */]);
const TS6_API = "npm:@typescript/typescript6@6.0.2";
const readPackage = (pkg) => {
  if (NEEDS_TS6_API.has(pkg.name) && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: TS6_API };
  }
  return pkg;
};
module.exports = { hooks: { readPackage } };
```

**Alternativa só para repositórios sem Next.js** (alias do pacote `typescript`):

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@7.0.2",
    "typescript": "npm:@typescript/typescript6@6.0.2"
  }
}
```

- `npx tsc` / `@typescript/native` → compilador 7.
- `typescript` (peer de eslint) → API 6 via `@typescript/typescript6` (binário `tsc6`).

**Não use este alias com Next.js 16.3+: ele quebra o build.** O Next 16.3 usa
`experimental.useTypeScriptCli: true` por padrão e exige que o pacote `typescript`
tenha `bin/tsc`; com o alias ele só tem `bin/tsc6`, e o `next build` falha com
"do not have the required package(s) installed" (verificado em projeto DDC em
2026-09-25).

Projetos **sem** typescript-eslint nem Vue/Svelte/MDX/Astro/Angular language plugins podem instalar só `typescript@7.0.2`.

Reavaliar quando o typescript-eslint aceitar TS 7 ou o TS 7.1 expuser a API. Motivo medido: `typescript-eslint@8.71.0` declara peer `typescript >=4.8.4 <6.1.0` (ADR 0004, E2).
Ao migrar: `baseUrl` foi removido (TS5102) — seguro quando as `paths` já são relativas.

## O que mudou vs TypeScript 6

| Aspecto | TS 6 | TS 7 |
|---|---|---|
| Implementação | JavaScript (Node) | Nativo (Go) |
| Speedup típico de build | baseline | ~8-12x |
| Language server | single-thread clássico | LSP multi-thread |
| API programática | `import typescript` | **ainda não** (use side-by-side 6) |
| Defaults de config | endurecidos em 6.0 | herda 6.0 + erros duros em deprecations |
| Template literal Unicode | splits UTF-16 | preserva code points |
| Flags `--checkers` / `--builders` | n/a | paralelismo de type-check e project refs |
| `--singleThreaded` | n/a | debug / CI com poucos cores |

Deprecations de 6.0 viram **hard errors** em 7: `target: es5`, `moduleResolution: node/node10`, `baseUrl`, `module: amd|umd|system`, `esModuleInterop: false`, etc.

## Breaking / defaults herdados de 6.0 (obrigatórios)

- **Flags removidas desde 5.x→6**: `--prepend`, `--charset`, `--keyofStringsOnly`, `--importsNotUsedAsValues` (use `verbatimModuleSyntax`), etc.
- **Defaults endurecidos**: `strict: true`, `useDefineForClassFields: true`, `stableTypeOrdering: true` (não desligável em 7), `noUncheckedSideEffectImports: true`, `types` default `[]` (listar `@types` explicitamente), `rootDir` default `./`.
- **`erasableSyntaxOnly`**: proíbe `enum`, `namespace` runtime, parameter properties, decorators legados — alinha com Node strip-types.
- **Emit**: apps com bundler → `module: "preserve"` + `moduleResolution: "bundler"`. Libs/Functions → `nodenext`.

Caminho: zerar `tsc --noEmit` no TS 6.0 sem `ignoreDeprecations` (cada deprecation vira erro no 7), depois `npm i -D -E typescript@7.0.2`. Não existe codemod oficial `@typescript/migrate-6` no npm (conferido em 2026-09-28).

## Features marcantes (5.4 → 7)

Acumulado que o projeto usa ativamente.
Resumo do que acumulou entre 5.4 e 6.x e o que vale usar.

### `NoInfer<T>` (5.4)

Bloqueia inferência de um parâmetro de tipo a partir de um argumento específico, deixando a inferência vir de outro:

```ts
const createStreetLight = <C extends string>(
  colors: C[],
  defaultColor?: NoInfer<C>,
): void => { /* ... */ };

createStreetLight(["red", "yellow", "green"], "red");     // OK
createStreetLight(["red", "yellow", "green"], "blue");    // erro
```

Use em DSLs e factories onde um parâmetro deve restringir o outro sem alargar a união.

### Inferred type predicates (5.5)

`Array.prototype.filter` infere predicados de narrowing automaticamente:

```ts
const items: (string | null)[] = ["a", null, "b"];
const cleaned = items.filter(x => x !== null);
//    ^? string[]   (antes: (string | null)[])
```

Funciona com `=== null`, `!== undefined`, `typeof`, `instanceof` e checagens compostas óbvias. Não precisa mais escrever `(x): x is string => x !== null` na maioria dos casos. Predicates explícitos continuam necessários para narrowing customizado (ver `@rules/validation`).

### Regular expression syntax checking (5.5)

Erros de regex literal são reportados em build (grupos não fechados, classes inválidas, backreferences ausentes). Não substitui teste, mas pega typos.

### `Object.groupBy` / `Map.groupBy` (5.4+, runtime ES2024)

Tipados em `lib.es2024.collection.d.ts`. Use em vez de `reduce` manual:

```ts
const byStatus = Object.groupBy(orders, (o) => o.status);
//    ^? Partial<Record<string, Order[]>>
```

Note `Partial<Record<...>>` — chaves não são garantidas. Combine com `noUncheckedIndexedAccess`.

### `--module preserve` / `--moduleResolution bundler` (maduros)

`preserve` mantém `import`/`export` exatamente como escrito (sem reescrita de extensões). `bundler` resolve sem exigir `.js` em paths. Use em apps com bundler (Next, Vite). Para libs publicadas em npm, use `nodenext`.

### Stable `using` / `await using` (Explicit Resource Management — 5.2+, maduro em 6)

```ts
{
  using file = openFile(path);          // Symbol.dispose chamado ao sair do escopo
  await using conn = await openDb();    // Symbol.asyncDispose chamado
  // ...
}  // dispose chamado aqui, mesmo em throw
```

Substitui `try/finally` para recursos disponíveis. Em Node 24+ (baseline: 26), suporte nativo. Use para conexões de banco, locks, spans de tracing.

### Iterator helpers tipados (5.6+)

`map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray` em iterators (não só arrays). Tipos completos. Disponível em runtime ES2025+ (Node 24+; baseline: 26).

### `--noUncheckedSideEffectImports` (5.6)

Erro quando `import "./side-effect"` aponta para módulo inexistente — antes era silenciosamente preservado.

### Path rewriting em emit (5.7)

`tsc` reescreve paths relativos para incluir `.js` no output quando `--rewriteRelativeImportExtensions`. Útil para libs que escrevem `.ts` no source mas publicam `.js`. Não use em apps com bundler.

### `--erasableSyntaxOnly` (5.8+, obrigatório no projeto)

Restringe a sintaxe permitida ao que pode ser apagado sem transformação semântica — proíbe `enum`, `namespace` com conteúdo runtime, `import =`/`export =` legacy, parameter properties em construtores, decoradores legados. Alinha com Node strip-types (ver `@stacks/runtime/node@26`), permitindo executar `.ts` direto sem `tsx`/`ts-node`.

Código que dependia de `enum` ou parameter properties precisa migrar antes de habilitar.

### Paralelismo do compilador nativo (7.0)

```bash
npx tsc --noEmit --checkers 4          # default ~4 workers de type-check
npx tsc -b --builders 2 --checkers 4   # monorepo: project refs em paralelo
npx tsc --singleThreaded               # CI com 1–2 vCPU ou debug determinístico
```

Aumentar `--checkers` acelera em máquinas com muitos cores e custa memória. Em CI barato, preferir `--checkers 1` ou `--singleThreaded`.

### Conditional types e branded types refinados

Inferência em distributive conditional types ficou mais previsível; recursão profunda tem limites mais altos antes de cair em `any`. Branded types via intersection funcionam sem hacks (ver Idioms).

### Decorators stage-3 estáveis

Sem `experimentalDecorators`. Sintaxe nova:

```ts
function logged<This, Args extends any[], Return>(
  target: (this: This, ...args: Args) => Return,
  ctx: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
) {
  return function (this: This, ...args: Args): Return {
    logger.debug("method_called", { method: String(ctx.name) }); // logger do projeto, nunca console
    return target.call(this, ...args);
  };
}
```

Use com parcimônia. Funções de ordem superior resolvem 90% dos casos sem decorator.

## `tsconfig.json` canônico

Base para apps do projeto:

```jsonc
{
  "compilerOptions": {
    "target": "ES2025",
    "lib": ["ES2025", "ESNext.Disposable", "DOM", "DOM.Iterable"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "jsx": "preserve",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,

    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "isolatedModules": true,

    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true, // só válido com noEmit/emitDeclarationOnly
    "noEmit": true,

    // alias absoluto; sem baseUrl (removido no TS 7, TS5102) — paths relativos ao tsconfig
    "paths": { "@/*": ["./src/*"] },

    // TS 6+/7: não puxar todos os @types/* automaticamente
    "types": ["node"],

    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": ".tscache/tsbuildinfo"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", ".next"]
}
```

### Variações por contexto

- **Libs publicadas em npm**: trocar `"module": "preserve"` → `"nodenext"`, `"moduleResolution": "bundler"` → `"nodenext"`, `"noEmit": false`, **remover `allowImportingTsExtensions`** (inválido com emit; use `rewriteRelativeImportExtensions` se o source importa `.ts`), adicionar `"outDir": "dist"`, `"declaration": true`, `"declarationMap": true`, `"sourceMap": true`.
- **Firebase Functions** (ver `@stacks/backend/firebase-functions`): estratégia de build/bundling **a definir pelo projeto**. `tsc` puro com `nodenext` não reescreve o alias `@/` nem aceita imports sem extensão no output; ou se usa um bundler (que resolve `paths`), ou imports relativos com extensão + `rewriteRelativeImportExtensions`. Em qualquer caso, emit habilitado exclui `allowImportingTsExtensions`.
- **Apps Next.js 16** (ver `@stacks/frontend/next@16`): manter `"module": "preserve"` + `"moduleResolution": "bundler"`; deixar Next gerar o `tsconfig.json` inicial.
- **Monorepos**: ative `composite: true` + `references` em cada pacote; raiz com `"files": []` e apenas `references`.

### Flags não-negociáveis

- `strict: true` — sem exceção.
- `noUncheckedIndexedAccess: true` — `arr[i]` é `T | undefined`. Reflete a realidade do JavaScript.
- `exactOptionalPropertyTypes: true` — `{ x?: string }` não aceita `{ x: undefined }`. Força clareza sobre "ausente" vs "presente e undefined".
- `verbatimModuleSyntax: true` — proíbe `import` de tipo sem `import type`. Necessário para `erasableSyntaxOnly` e strip-types.
- `erasableSyntaxOnly: true` — alinha com Node strip-types, força idiomas modernos.

## Idioms

### `import type`

Obrigatório com `verbatimModuleSyntax`:

```ts
import type { User } from "./types";
import { fetchUser } from "./api";
```

Para imports mistos:

```ts
import { fetchUser, type User } from "./api";
```

### Branded types

Tipos nominais para evitar trocar `UserId` por `OrderId`:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

const asUserId = (s: string): UserId => s as UserId;
```

Combine com validação Zod runtime (ver `@stacks/validation/zod@4` e `@rules/data-modeling`). A asserção `as UserId` deve viver apenas dentro do parser; nunca espalhe `as` por código de domínio.

### `as const`

Congela literais para usar em discriminated unions ou contratos:

```ts
const ROLES = ["admin", "viewer", "editor"] as const;
type Role = (typeof ROLES)[number];  // "admin" | "viewer" | "editor"
```

### Discriminated unions sobre enums

```ts
type Event =
  | { type: "click"; x: number; y: number }
  | { type: "key"; key: string }
  | { type: "scroll"; delta: number };
```

Use `switch` com `never` exhaustiveness:

```ts
const handle = (e: Event): void => {
  switch (e.type) {
    case "click": return;
    case "key": return;
    case "scroll": return;
    default: {
      const _exhaustive: never = e;
      throw new Error(`unhandled: ${JSON.stringify(_exhaustive)}`);
    }
  }
};
```

### `satisfies`

Valida que um objeto bate com um tipo sem perder a inferência literal:

```ts
const config = {
  api: "https://api.example.com",
  timeout: 5000,
} satisfies AppConfig;

config.api;  // string literal, não string
```

### Type predicates seguros

Quando `filter` não infere automaticamente, escreva o predicate alinhado com runtime check:

```ts
const isOrder = (x: unknown): x is Order =>
  typeof x === "object" && x !== null && "id" in x && typeof x.id === "string";
```

Para schemas complexos, delegue a Zod (ver `@stacks/validation/zod@4`) e use `z.infer` para o tipo (ver `@rules/validation`).

### Generics constrained

Restrinja parâmetros de tipo. Genéricos abertos viram `unknown` no uso e geram bugs sutis:

```ts
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
```

### `using` para resource management

```ts
const withTransaction = async (db: Db) => {
  await using tx = await db.begin();
  await tx.exec("...");
  await tx.commit();
  // se throw entre begin e commit, dispose roda rollback
};
```

Disponível nativamente em Node 24+ (baseline: 26).

## Execução local e build

### Rodar `.ts` direto

Com strip-types (Node 24+; baseline 26; ver `@stacks/runtime/node@26`):

```bash
node script.ts                    # strip-types automático, sem flag
```

Type stripping é Stable desde Node v25.2.0/v24.12.0; `--no-strip-types` desliga. A flag `--experimental-strip-types` não aparece mais na CLI do Node 26.

`tsx` deixa de ser obrigatório para scripts simples. Continua útil quando precisa de transformação além de apagar tipos (decorators, JSX em CLI, etc).

### Typecheck (CI)

```bash
tsc --noEmit
```

Esta é a verificação de build do projeto. Roda em CI; nunca confie no editor sozinho.

### Build de produção

- **Apps Next/Vite**: bundler cuida do emit; `tsc --noEmit` apenas para typecheck.
- **Libs**: `tsc -b` (com project references) ou `tsup`/`unbuild` para bundles dual ESM+CJS.
- **Firebase Functions** (ver `@stacks/backend/firebase-functions`): saída em `lib/`, entrada do package aponta para `lib/index.js`; ferramenta de build (bundler ou `tsc` com imports relativos) **a definir pelo projeto** (ver "Variações por contexto").

## Integração com o stack

- **Zod 4** (ver `@stacks/validation/zod@4`): use `z.infer<typeof Schema>` como única fonte de tipo para fronteiras (API, formulários, DB). Não duplique types manualmente.
- **Next.js 16** (ver `@stacks/frontend/next@16`): `tsconfig.json` gerado pelo Next; mantenha `verbatimModuleSyntax` e `erasableSyntaxOnly`.
- **React 19** (ver `@stacks/frontend/react@19`): `@types/react@19` + `@types/react-dom@19`; sem `FC` — anote props diretamente.
- **Postgres / Drizzle** (ver `@stacks/database/postgres`): tipos derivados do schema Drizzle; nunca escreva interface paralela à tabela.
- **Firebase Functions** (ver `@stacks/backend/firebase-functions`): emit habilitado, target ES2025 (runtime `nodejs24`, ADR 0004 E1); `module`/bundling a definir pelo projeto (ver "Variações por contexto").

## Performance

- `incremental: true` + `tsBuildInfoFile` — cache de build entre runs.
- `project references` em monorepos — `tsc -b` reconstrói apenas o que mudou.
- `skipLibCheck: true` — aceitável e recomendado; checagem completa de `.d.ts` de dependências é cara e raramente útil.
- `assumeChangesOnlyAffectDirectDependencies` em watch mode quando o grafo é grande.

## Diagnostics

Quando o build está lento ou um tipo se comporta de forma estranha:

```bash
tsc --diagnostics              # tempo total por fase
tsc --extendedDiagnostics      # detalhe de memória, checks, símbolos
tsc --listFiles                # arquivos no programa
tsc --traceResolution          # como cada import foi resolvido
tsc --generateTrace ./trace    # trace consumível em chrome://tracing
```

Use `--generateTrace` para diagnosticar "type olympics" — funções genéricas que explodem o checker.

## Lint complementar

TypeScript não substitui linter. Use ESLint **9.39.5** (E3: ESLint 10 fica de fora porque `eslint-plugin-react@7.37.5` só aceita `^9.7`) type-aware com `typescript-eslint@8.71.0` (`@typescript-eslint/parser` com `projectService: true`). O typescript-eslint roda na API do TS 6 (`@typescript/typescript6@6.0.2`, E2, ver "Side-by-side" acima); o `tsc` segue no 7. Regras mínimas: `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`, `no-explicit-any`, `prefer-as-const`, `switch-exhaustiveness-check`. Veja `@rules/development`.

## Migração 5.x / 6 → 7

1. Rode no Node do baseline: **26** (`@stacks/runtime/node@26`; Functions em 24, E1). `typescript@7.0.2` declara `engines.node >=16.20.0`, então o Node não é o bloqueio.
2. Se ainda em 5.x: suba para TS 6.0 e zere os avisos de deprecation.
3. Substitua `enum` por `as const` + union literal; parameter properties por fields explícitos.
4. Remova `experimentalDecorators` legados; remova `baseUrl` (paths relativos à raiz do projeto).
5. Ative `erasableSyntaxOnly` + `verbatimModuleSyntax` e zere `tsc --noEmit`.
6. Liste `types` explicitamente (`["node"]`, etc.).
7. Instale `typescript@7.0.2` (pin exato). Se typescript-eslint/Volar quebrar, use side-by-side com `@typescript/typescript6`.
8. CI: `npx tsc --noEmit` com Node 26; em runners pequenos use `--singleThreaded`.
9. Editor: VS Code — extensão TypeScript 7 / native-preview; desligar só se plugin de Vue/Svelte exigir TS 6.

## Anti-patterns

- **`any` para sair de problema**. Use `unknown` e estreite, ou modele o tipo. `any` desativa o checker no ponto de uso e contamina o resto.
- **`as` para coerção sem validação runtime**. `JSON.parse(s) as User` é mentira para o compilador. Valide com Zod (`@stacks/validation/zod@4`, `@rules/validation`).
- **Types espelhando objetos quando `z.infer` resolve**. Manter `interface User` paralela ao `UserSchema` é dois locais para errar.
- **Enums numéricos**. Bloqueados por `erasableSyntaxOnly`. Use `as const` + union de strings.
- **`namespace` ou `module` legacy**. Bloqueados em código novo. Use ES modules.
- **`noUncheckedIndexedAccess` desligado**. Index access em runtime pode retornar `undefined`; o tipo deve refletir isso.
- **Over-generics ("type olympics")**. Se um tipo tem mais de três parâmetros condicionais aninhados, repense. Tipos devem ser legíveis em 30 segundos.
- **Decoradores legados em código novo**. Stage-3 ou função de ordem superior.
- **Classes onde funções resolvem**. TypeScript não é Java. State management em hooks/stores, lógica em funções puras, classes apenas quando há ciclo de vida real (resource handles, etc).
- **`!` (non-null assertion) espalhado**. Cada `!` é um bug em potencial. Use narrowing, predicates ou erro explícito.
- **`@ts-ignore` / `@ts-expect-error` sem comentário**. Sempre justifique. Prefira `@ts-expect-error` (falha quando o erro some).

## Referências cruzadas

- `@stacks/runtime/node@26` — runtime, strip-types, `using` nativo.
- `@stacks/validation/zod@4` — schema runtime + `z.infer`.
- `@stacks/frontend/next@16` — config de TS em apps Next.
- `@stacks/frontend/react@19` — types de React 19.
- `@stacks/database/postgres` — tipos derivados de schema.
- `@stacks/backend/firebase-functions` — config TS para Functions.
- `@rules/development` — lint, formatação, regras de código.
- `@rules/validation` — onde valida runtime e como deriva tipos.
- `@rules/data-modeling` — branded types, modelagem de IDs e VOs.
