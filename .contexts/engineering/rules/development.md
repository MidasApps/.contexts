---
title: Regras Gerais de Desenvolvimento
type: rules
scope: global
status: active
last_updated: 2026-07-13
---

# Regras Gerais de Desenvolvimento

Regras imperativas e transversais que governam como escrever código neste projeto. Cada regra é atômica, enforce e independente de tecnologia específica. Para regras específicas de stack, consulte `@.contexts/engineering/stacks/`. Para regras de modelagem de fronteiras, consulte `@.contexts/engineering/contracts/`.

## Escopo

Aplica-se a todo código-fonte do projeto: backend (Firebase Functions, serviços Node), frontend (Next.js, React), scripts, infraestrutura como código e ferramentas internas. Não cobre estrutura arquitetural (ver `@.contexts/engineering/architecture/`), métodos de trabalho (ver `@.contexts/engineering/practices/`) nem fluxo de git (ver `@.contexts/engineering/processes/`).

## Linguagem e tipagem

- Sempre use TypeScript. Nunca adicione arquivos `.js` novos ao código de produção.
- Nunca use `any`. Use `unknown` quando o tipo é desconhecido e estreite com type guards.
- Nunca use `// @ts-ignore`. Use `// @ts-expect-error` com comentário explicativo quando inevitável.
- Sempre declare tipos de retorno explícitos em funções exportadas.
- Nunca use `as` para coerção de tipo sem validação prévia. Prefira parse com schema (`@.contexts/engineering/stacks/validation/zod@4.md`).
- Sempre prefira `type` para uniões e composições; use `interface` apenas quando precisar de extensão ou declaration merging.
- Nunca use enums TypeScript. Use uniões literais (`type Status = 'active' | 'inactive'`) ou objetos `as const`.
- Sempre habilite `strict: true` no `tsconfig.json`. Não relaxe flags estritas individualmente.

## Imports e módulos

- Sempre use ESM (`import`/`export`). Nunca use `require()` em código de produção.
- Sempre use imports nomeados. Evite `default export` exceto onde o framework exige (páginas Next.js, componentes lazy-loaded).
- Nunca importe de caminhos relativos profundos (`../../../`). Configure aliases (`@/`) e use-os.
- Sempre ordene imports: built-in Node → libs externas → aliases internos → relativos. Deixe para o linter automatizar.
- Nunca importe de arquivos `index.ts` barrel quando puder importar do módulo direto. Barrels mascaram dependências circulares.

## Nomenclatura

- Sempre use `camelCase` para variáveis, funções e propriedades.
- Sempre use `PascalCase` para tipos, classes, componentes React e enums-como-objeto.
- Sempre use `SCREAMING_SNAKE_CASE` para constantes verdadeiramente imutáveis exportadas no nível de módulo.
- Sempre use `kebab-case` para nomes de arquivo. Exceção: componentes React podem usar `PascalCase` se a convenção do diretório for consistente.
- Nunca use abreviações ambíguas (`usr`, `btn`, `cfg`). Use o nome completo (`user`, `button`, `config`).
- Nunca prefixe interfaces com `I` (`IUser`). Nunca sufixe tipos com `Type` (`UserType`).
- Sempre nomeie booleanos com prefixo afirmativo: `isActive`, `hasPermission`, `canEdit`. Nunca use negações no nome (`isNotReady`).

## Funções e controle de fluxo

- Sempre prefira funções puras quando possível. Side effects devem ser explícitos no nome (`saveUser`, `sendEmail`).
- Nunca use `function` declaration no nível de módulo para lógica de aplicação. Use `const fn = () => {}` para consistência. Exceção: assinaturas que precisam de hoisting ou `this` léxico.
- Sempre use early return para reduzir aninhamento. Nunca aninhe mais de 3 níveis de `if`/`for`.
- Nunca use `else` após `return`, `throw`, `continue` ou `break`.
- Sempre prefira composição funcional (`map`, `filter`, `reduce`) a loops imperativos quando o resultado é uma transformação.
- Nunca mute parâmetros de função. Trate-os como `readonly`.
- Sempre marque parâmetros de objeto com `Readonly<T>` quando a função não deveria mutá-los.

## Tratamento de erros

- Sempre lance `Error` (ou subclasse). Nunca lance strings, números ou objetos literais.
- Sempre crie classes de erro de domínio (`ValidationError`, `NotFoundError`) em vez de usar `Error` genérico em fronteiras.
- Nunca use `try/catch` para controle de fluxo. Use-o apenas para erros excepcionais.
- Nunca capture erros silenciosamente. Todo `catch` deve logar, re-lançar ou converter para erro de domínio.
- Sempre tipifique o erro em `catch` como `unknown` (TypeScript 7 default (useUnknownInCatchVariables)) e estreite antes de usar.
- Nunca retorne `null` para indicar erro. Use union de resultado (`Result<T, E>`) ou lance.
- Sempre valide entrada externa (API, formulário, env vars) com schema antes de processar. Erros de validação são esperados, não excepcionais.

## Async e concorrência

- Sempre use `async`/`await`. Nunca encadeie `.then()` em código novo.
- Nunca use `async` em funções que não aguardam nada. Retorne `Promise.resolve(value)` se precisar manter assinatura assíncrona.
- Sempre aguarde ou retorne promises explicitamente. Nunca deixe promises "soltas" (`floating promises`).
- Sempre use `Promise.all` para operações independentes em paralelo. Nunca `await` em loop quando as iterações são independentes.
- Nunca use `Promise.all` quando uma falha parcial é aceitável. Use `Promise.allSettled`.
- Sempre defina timeout em chamadas de rede. Nunca confie no timeout default do cliente.

## Imutabilidade e estado

- Sempre prefira `const`. Use `let` apenas quando reatribuição é semanticamente necessária. Nunca use `var`.
- Sempre trate objetos e arrays como imutáveis. Use spread (`{...obj}`, `[...arr]`) ou bibliotecas estruturais.
- Nunca mute props em React. Nunca mute state diretamente; use o setter.
- Sempre marque coleções públicas com `ReadonlyArray<T>` ou `Readonly<Record<K, V>>` quando consumidores não devem modificar.

## Comentários e documentação

- Nunca comente o que o código faz. Comente apenas o porquê quando não é óbvio.
- Sempre remova código comentado. O histórico vive no git.
- Sempre use JSDoc em APIs públicas exportadas de módulos compartilhados. Documente parâmetros não-óbvios e efeitos colaterais.
- Nunca deixe `TODO` sem dono ou link para issue. Formato: `// TODO(@usuario,#123): descrição`.
- Sempre escreva comentários em português ou inglês de forma consistente dentro de um mesmo módulo. Não misture idiomas.

## Logs e observabilidade

- Nunca use `console.log` em código de produção. Use o logger estruturado do projeto.
- Sempre logue erros com contexto (operação, identificadores relevantes, payload sanitizado). Nunca logue apenas a mensagem.
- Nunca logue dados sensíveis (senhas, tokens, PII, segredos). Mascare ou omita.
- Sempre use níveis adequados: `error` para falhas, `warn` para condições recuperáveis suspeitas, `info` para eventos de negócio, `debug` para diagnóstico local.

## Segurança e dados sensíveis

- Nunca commite segredos. Use o gerenciador de secrets configurado (ver `@.contexts/engineering/decisions/`).
- Sempre leia segredos via variável de ambiente ou secret manager em runtime. Nunca hardcode.
- Sempre valide e sanitize entrada de usuário antes de usar em queries, paths ou comandos.
- Nunca confie em dados do cliente para decisões de autorização. Valide no servidor.
- Sempre use parametrização em queries SQL. Nunca concatene strings para construir SQL.

## Dependências externas

- Nunca adicione dependência nova sem justificativa documentada. Prefira código próprio quando trivial.
- Sempre fixe versões exatas em `package.json` para libs críticas (segurança, runtime, build). Use ranges apenas para tipos e devDependencies.
- Nunca importe transitivamente. Se você usa, declare explicitamente em `dependencies`.

## Configuração e ambiente

- Sempre acesse variáveis de ambiente através de um módulo de config validado por schema. Nunca leia `process.env.X` espalhado pelo código.
- Sempre falhe rápido na inicialização se config obrigatória estiver ausente ou inválida. Nunca retorne default silencioso para segredos.
- Nunca diferencie comportamento por NODE_ENV em lógica de negócio. Use feature flags ou config explícita.

## Testabilidade

- Sempre injete dependências externas (banco, HTTP, clock, randomness) via parâmetro ou construtor. Nunca importe singletons dentro de funções de negócio.
- Nunca chame `Date.now()` ou `Math.random()` diretamente em código testável. Receba via parâmetro.
- Sempre escreva código para ser determinístico dado o mesmo input. Side effects devem ser isoláveis.

## Anti-patterns

- Nunca use `eval()` ou `new Function()` com input não confiável.
- Nunca use comparação solta (`==`, `!=`). Use estrita (`===`, `!==`).
- Nunca use `delete` em objetos de domínio. Crie novo objeto sem a propriedade.
- Nunca use `for...in` em arrays. Use `for...of` ou métodos de iteração.
- Nunca dependa de ordem de inserção em `Object.keys()` para chaves numéricas.
- Nunca use `arguments`. Use rest parameters (`...args`).

## Exemplos

### Tratamento de erros

Errado:

```ts
try {
  const data = await fetchUser(id);
  return data;
} catch (e) {
  return null;
}
```

Certo:

```ts
try {
  return await fetchUser(id);
} catch (error) {
  logger.error('fetchUser failed', { id, error });
  throw new UserFetchError(id, { cause: error });
}
```

### Tipagem de erro

Errado:

```ts
} catch (e: any) {
  console.log(e.message);
}
```

Certo:

```ts
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown error';
  logger.error('operation failed', { message });
}
```

### Imutabilidade

Errado:

```ts
function addItem(list: Item[], item: Item) {
  list.push(item);
  return list;
}
```

Certo:

```ts
function addItem(list: ReadonlyArray<Item>, item: Item): ReadonlyArray<Item> {
  return [...list, item];
}
```

## Referências cruzadas

- Regras específicas de TypeScript: `@.contexts/engineering/stacks/language/typescript@7.md`
- Regras específicas de Node: `@.contexts/engineering/stacks/runtime/node@24.md`
- Validação com Zod: `@.contexts/engineering/stacks/validation/zod@4.md`
- Convenções de modelagem de schemas: `@.contexts/engineering/contracts/`
- Regras de segurança detalhadas: `@.contexts/engineering/rules/security.md`
- Regras de validação detalhadas: `@.contexts/engineering/rules/validation.md`
- Regras de error handling detalhadas: `@.contexts/engineering/rules/error-handling.md`
- Regras de observabilidade detalhadas: `@.contexts/engineering/rules/observability.md`
