---
title: Node.js
type: stacks
category: runtime
version: 26.10.0
last_updated: 2026-09-29
status: current
upstream: https://nodejs.org/docs/latest-v26.x/api/
supersedes: node@24
---

# Node.js 26 (Current)

Runtime JavaScript do projeto. Versão **26.10.0** (2026-09-21), a última estável na data de medição (2026-09-28). Node 26 está na linha **Current** até **2026-10-28**, quando vira LTS; entra em Maintenance em 2027-10-20 e chega ao EOL em 2029-04-30. O projeto adota a política **"manter sempre a última versão estável; qualquer incompatibilidade vira ADR"**. O projeto Node recomenda LTS em produção; o desvio consciente dessa recomendação e as exceções (Firebase Functions em `nodejs24`) estão registrados em [ADR 0004](../../decisions/0004-latest-stable-baseline-and-documented-exceptions.md). **Node 24** (Krypton) entra em Maintenance em 2026-10-20 e chega ao EOL em 2028-04-30; Node 20 está em EOL.

> Single source of truth para qualquer ambiente que execute código JS/TS no projeto: scripts locais, CI, ferramentas de build, server runtime de Next.js. As exceções são o deploy de Firebase Functions (E1, ver "Exceção: Firebase Functions") e o runtime de prod do `apps/web` no Firebase App Hosting (E6 provisória, ver "Exceção: Firebase App Hosting"), ambos em `nodejs24`. Versão é fixada em `.nvmrc`, `package.json#engines` e imagem base do Docker/CI.

## Por que Node 26 importa para o projeto

O Node moderno (24 em diante) colapsa várias dependências externas que existiam por necessidade no ecossistema Node 20 e anteriores. A política do projeto é **preferir built-in sobre userland** sempre que o built-in cobrir o caso de uso, tanto por bundle size quanto por superfície de segurança reduzida (ver [@rules/security](../../rules/security.md)).

A linha também viabiliza execução direta de TypeScript em scripts (type stripping, estável desde v25.2.0/v24.12.0), eliminando `tsx`/`ts-node` na maioria dos pontos onde só queremos rodar um `.ts` rapidamente.

## O que mudou vs Node 24

Fonte: [release notes do Node 26.0.0](https://nodejs.org/en/blog/release/v26.0.0) (2026-05-05). Somente o que foi verificado; para qualquer outro detalhe, consultar o changelog oficial antes de afirmar.

**Novidades**

- **Temporal API** habilitada por padrão.
- **V8 14.6** (era 13.6 no Node 24.21.0).
- **Undici 8** (base do `fetch` global).

**Removido (breaking)**

- `http.Server.prototype.writeHeader()` — usar `writeHead()`.
- Módulos legados `_stream_wrap`, `_stream_readable`, `_stream_writable`, `_stream_duplex`, `_stream_transform`, `_stream_passthrough` — usar `node:stream`.
- Flag `--experimental-transform-types`.

**Runtime-deprecated (emite aviso)**

- `module.register()` — usar `module.registerHooks()`.
- DEP0201 (stream) e DEP0203/DEP0204 (crypto).

**Checklist de migração (24 para 26):** buscar no código e nas dependências por `writeHeader(`, imports de `_stream_*`, `--experimental-transform-types` em scripts npm e `module.register(`; rodar a suíte com `--trace-deprecation` para localizar usos das deprecações DEP0201/0203/0204. Qualquer incompatibilidade encontrada vira ADR (ver [ADR 0004](../../decisions/0004-latest-stable-baseline-and-documented-exceptions.md)).

## Features relevantes vs Node 20

### Native TypeScript via type stripping

O **type stripping** entrou no v22.6.0, ficou ligado por padrão no v23.6.0/v22.18.0 e é **Stable** desde v25.2.0/v24.12.0 (a flag de desligar passou de `--no-experimental-strip-types` para `--no-strip-types`). Executa arquivos `.ts` diretamente, removendo anotações de tipo sem fazer type-check.

```bash
node script.ts                 # roda direto, sem flag
node --no-strip-types app.js   # desliga o type stripping
```

**Limitações** (não cobertas pelo strip-types — exigem transformação real, então usar `tsc`/bundler):

- `enum` (sintaxe não é só anotação)
- `namespace` com runtime code
- Decoradores legados (`experimentalDecorators`)
- Path aliases do `tsconfig` (resolução não acontece)
- JSX/TSX

A flag `--experimental-transform-types` foi removida no Node 26: não há mais transformação de TS no runtime; use `tsc`/bundler para essas construções.

**Onde aplicar:** scripts internos, ferramentas de migração, seeds, one-shots locais. **Onde NÃO aplicar:** build de produção (continua via `tsc --noEmit` para checagem + bundler para emissão). Ver [@stacks/language/typescript@7](../language/typescript@7.md).

Anti-pattern: manter `tsx`/`ts-node` como dependência só para rodar scripts simples — remover.

### `--run` estável

Executa scripts do `package.json` sem overhead do package manager.

```bash
node --run build       # ~5-10x mais rápido que `npm run build` para scripts curtos
node --run lint
```

**Onde aplicar:** CI, hooks de git, qualquer chamada de script onde o overhead do npm/pnpm domina o tempo total. **Limitação:** não suporta `pre`/`post` hooks; se o script depende deles, manter `npm run`/`pnpm`.

### `node --watch` estável

Substitui `nodemon` para a maioria dos casos.

```bash
node --watch server.ts
node --watch --watch-path=./src app.ts
```

Anti-pattern: manter `nodemon` quando `--watch` resolve.

### Permission Model estável

Sandbox built-in, **Stable** desde v23.5.0/v22.13.0. Com `--permission`, o Node 26 restringe FS (`--allow-fs-read`, `--allow-fs-write`), **rede** (`--allow-net`), child_process (`--allow-child-process`), workers (`--allow-worker`), WASI (`--allow-wasi`), addons nativos (`--allow-addons`), FFI (`--allow-ffi`) e loaders OpenSSL STORE (`--allow-openssl-store`). `--allow-net` entrou no v25.0.0 e está em **Stability 1.1 (Active development)**; é tudo ou nada, sem filtro por host. `--permission-audit` (v25.8.0) só registra as violações via `node:diagnostics_channel`, sem negar acesso: serve para descobrir o que liberar antes de ligar `--permission`.

No Node 24 (Firebase Functions, E1) não existe `--allow-net`: lá a rede não é restringida pelo permission model. Em qualquer runtime, restrinja egress também na infraestrutura (firewall, VPC, egress policy).

```bash
node --permission --allow-fs-read=./data script.ts            # sem rede
node --permission --allow-fs-read=./data --allow-net script.ts
```

**Onde aplicar (obrigatório):** scripts que executam código de terceiros, jobs de processamento de input não confiável, qualquer fluxo onde supply-chain attack é vetor. Ver [@rules/security](../../rules/security.md). **Onde aplicar (recomendado):** scripts de CI que tocam credenciais.

### WebSocket client built-in

```ts
const ws = new WebSocket('wss://example.com');
ws.addEventListener('message', (e) => console.log(e.data));
```

Anti-pattern: instalar `ws` quando só precisamos de client. Manter `ws` apenas para server-side WebSocket.

### `node:test` runner maduro

Test runner built-in com TAP output, watch, coverage, mocks.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('soma', () => {
  assert.equal(1 + 1, 2);
});
```

```bash
node --test --experimental-test-coverage
```

**Política do projeto:** continuar usando Vitest para testes de aplicação (ergonomia superior, ecossistema). `node:test` é apropriado para **bibliotecas internas** publicadas onde queremos zero dependência de teste.

### Import attributes estáveis

```ts
import data from './config.json' with { type: 'json' };
```

Substitui `assert { type: 'json' }` (deprecado).

### `module.registerHooks()` para custom loaders

Use `module.registerHooks()` (hooks síncronos, in-thread) para loaders customizados. `--loader` está deprecado; `module.register()` está deprecated desde o v24.15.0 e é **runtime-deprecated** no Node 26.

### V8 atualizado

V8 14.6 no Node 26 (13.6 no 24.21.0) → ganhos de performance em parsing/codegen. `structuredClone` agora suporta mais tipos (Error, DOMException compat). Não há ação requerida — apenas vem de graça no upgrade.

### `Intl` atualizado

CLDR mais recente, mais locales, melhorias em `Intl.Segmenter`, `Intl.DurationFormat`. Ver [@rules/internationalization](../../rules/internationalization.md).

### Temporal API

Habilitada por padrão no Node 26, sem flag nem polyfill. Uso preferido para datas/horas novas em código que roda em Node 26. Código compartilhado com Firebase Functions (`nodejs24`) não pode assumir a disponibilidade da Temporal lá (ver "Exceção: Firebase Functions").

### Top-level await e `import.meta`

Ambos estáveis desde antes mas reforçados como padrão:

```ts
// substitui __dirname/__filename em ESM
const here = import.meta.dirname;
const file = import.meta.filename;

// top-level await
const config = await loadConfig();
```

Anti-pattern: `fileURLToPath(import.meta.url)` + `path.dirname()` — use `import.meta.dirname` direto.

### Web APIs built-in (estáveis)

Todos disponíveis globalmente, sem import e sem polyfill:

- `fetch`, `Request`, `Response`, `Headers`
- `FormData`, `Blob`, `File`
- `crypto.randomUUID()`, `crypto.subtle`
- `structuredClone()`
- `URL`, `URLSearchParams`
- `AbortController`, `AbortSignal`
- `ReadableStream`, `WritableStream`, `TransformStream`
- `WebSocket` (cliente)
- `EventTarget`, `Event`, `CustomEvent`
- `performance.now()`, `performance.mark()`

Anti-patterns explícitos:

| Userland | Substituir por |
|---|---|
| `axios`, `node-fetch`, `got` | `fetch` global |
| `uuid` (v4) | `crypto.randomUUID()` |
| `dotenv` | `node --env-file=.env` |
| `nodemon` | `node --watch` |
| `tsx`, `ts-node` (scripts simples) | `node` direto (type stripping) |
| `ws` (client) | `WebSocket` global |
| `form-data` | `FormData` global |
| `node-cron` (simples) | `setInterval`/scheduler do Functions |

Manter userland apenas quando feature crítica não está coberta (ex: `axios` interceptors complexos, `ws` server, `tsx` para JSX/decorators).

### `node:sea` — Single Executable Apps

Empacotamento de app Node em binário único. Útil para CLIs internos distribuídos sem requerer Node instalado. Não usado em runtime de servidor.

## ESM como padrão

Todo código novo é ESM. Não há exceção. Ver [@rules/development](../../rules/development.md).

```jsonc
// package.json
{
  "type": "module",
  "engines": {
    "node": ">=26.0.0 <27"
  }
}
```

Exceção: o `package.json` do pacote de Firebase Functions mantém `"node": ">=24.0.0 <25"` (ver "Exceção: Firebase Functions").

- Use `import`/`export`, nunca `require`/`module.exports`.
- Use `node:` specifier para módulos built-in: `import fs from 'node:fs/promises'` (não `import fs from 'fs/promises'`).
- Top-level await é permitido e encorajado em entry points.
- Use `import.meta.dirname` em vez de `__dirname`.

CommonJS legado é tolerado apenas em dependências de terceiros via interop.

## Diagnostics e observability

Built-in suficiente para a maioria dos casos:

```bash
node --inspect=0.0.0.0:9229 server.ts        # debugger
node --prof app.ts                            # V8 profiler (raw)
node --cpu-prof --cpu-prof-dir=./profiles    # CPU profile direto
node --heap-prof                              # heap profile
node --trace-warnings                         # stack em warnings
node --trace-uncaught                         # stack em uncaughtException
```

Para instrumentação programática:

- `node:diagnostics_channel` — pub/sub de eventos internos (HTTP, DNS, net, undici).
- `node:perf_hooks` — `PerformanceObserver`, marks, measures.
- OpenTelemetry: hooks built-in expostos para instrumentation libraries (sem flag).

Ver [@rules/performance](../../rules/performance.md) para quando profilar versus quando aceitar.

## Worker threads

`node:worker_threads` para trabalho CPU-bound. Não usar para I/O (event loop resolve). Não usar como substituto de fila — para workloads paralelos persistentes, ver arquitetura de jobs.

```ts
import { Worker } from 'node:worker_threads';
const worker = new Worker(new URL('./heavy.ts', import.meta.url));
```

## Versionamento e tooling

- `.nvmrc`: `26` (deixa nvm resolver para a patch mais recente da linha).
- `package.json#engines.node`: `">=26.0.0 <27"`.
- `volta` (se em uso): `"volta": { "node": "26.x.x" }`.
- Tipos: `@types/node@26` (última: 26.6.3).
- CI: usar `actions/setup-node@v7` (última em 2026-09-28) com `node-version-file: .nvmrc` (ou `node-version: '26'` explícito, coerente com `.nvmrc`).
- Docker: imagem base `node:26-alpine` (ou `node:26-slim` se nativos forem necessários).

```yaml
- uses: actions/setup-node@v7
  with: { node-version: '26' }
```

```dockerfile
FROM node:26-alpine
```

## Exceção: Firebase Functions (nodejs24)

Cloud Functions / Firebase Functions **não tem runtime `nodejs26`** (a página oficial de runtime support lista `nodejs24` como o mais novo, default `google-24`, EOL 2028-04-30). Por isso, o runtime de deploy de Functions **permanece `nodejs24`** e o `engines` do pacote de functions permanece `">=24.0.0 <25"`; o restante (app, CI, Docker do app, tooling, `tsc`) usa Node 26. Justificativa e condições de revisão em [ADR 0004](../../decisions/0004-latest-stable-baseline-and-documented-exceptions.md).

Setar `runtime: 'nodejs24'` em todas as functions e não abrir função nova em `nodejs22`. Código compartilhado entre app e functions deve rodar em Node 24.

Ver [@stacks/backend/firebase-functions](../backend/firebase-functions.md).

Anti-pattern crítico em Functions: **imports caros no top-level**. Inflam cold start. Mover imports pesados para dentro do handler ou usar dynamic `import()` sob demanda.

```ts
// ruim — cold start paga sempre
import { BigLib } from 'big-lib';
export const handler = (...) => { BigLib.do(); };

// bom — paga só quando usado
export const handler = async (...) => {
  const { BigLib } = await import('big-lib');
  BigLib.do();
};
```

## Exceção: Firebase App Hosting (nodejs24, provisória)

O `apps/web` roda no App Hosting (ADR 0009). O App Hosting "supports even-numbered Node.js versions, mirroring Cloud Run's support", e o Cloud Run lista `nodejs26` só como Preview (medido em 2026-09-29). Preview não é versão (ADR 0004, regra 1), então o mais novo GA é `nodejs24` (E6, [ADR 0004](../../decisions/0004-latest-stable-baseline-and-documented-exceptions.md)).

- `apps/web` declara `engines.node` `">=24.0.0 <27"` e `@types/node@24` como guarda de tipos: o código do web não usa API que só existe na 26.
- Local e CI rodam Node 26 (`next dev`, `next build`, testes); em prod o App Hosting escolhe `nodejs24`.
- O que o web importa de `packages/*` segue a mesma guarda.
- A exceção é provisória: sai quando `nodejs26` for GA ou se o spike de App Hosting do SP0b falhar (fallback Next standalone no Cloud Run com `node:26-alpine`).
- O servidor Mastra no Cloud Run não entra nesta exceção: usa imagem própria `node:26-alpine` ([@stacks/backend/cloud-run](../backend/cloud-run.md)).

## Integração com Next.js 16

Next.js 16 server runtime roda sobre Node 26 (dev, CI, build). Nenhuma configuração especial — `package.json#engines.node` é fonte da verdade. Em Firebase App Hosting o runtime de prod é `nodejs24` (E6, seção acima). Ver [@stacks/frontend/next@16](../frontend/next@16.md).

## Integração com TypeScript

- **Scripts e ferramentas internas:** rodar `.ts` direto via type stripping. Sem build step.
- **Build de produção:** continua via bundler / `tsc` para emissão. Type-check sempre via `tsc --noEmit` (strip-types não valida tipos).
- **`tsconfig` para código rodado direto:** `module: "nodenext"`, `moduleResolution: "nodenext"`, `target: "es2025"` (baseline de `typescript@7.md`), imports relativos com extensão `.ts` (`allowImportingTsExtensions` + `noEmit`) — strip-types não resolve alias.

Ver [@stacks/language/typescript@7](../language/typescript@7.md).

## Performance defaults

Raramente precisamos tunar. Defaults do Node são bons. Casos onde mexer:

- `UV_THREADPOOL_SIZE=8` (default 4) — apenas se profiling mostrar saturação da threadpool (DNS, FS síncrono, crypto pesado). Não setar preventivamente.
- `--max-old-space-size=N` — apenas se OOM em workload conhecido. Em Functions, o runtime gerencia.
- GC flags (`--expose-gc`, `--gc-interval`) — não usar fora de debugging.

Ver [@rules/performance](../../rules/performance.md).

## Segurança

Política não-negociável: ver [@rules/security](../../rules/security.md). Pontos específicos de Node:

- **Permission Model** (`--permission`) em scripts que tocam credenciais ou processam input não confiável.
- **`--frozen-intrinsics`** em contextos sensíveis para impedir prototype pollution em runtime.
- **Supply chain:** auditar dependências, usar `npm audit signatures` / `pnpm audit`, fixar versões com lockfile, revisar transitivos novos. Preferir built-in (ver tabela de anti-patterns acima) reduz superfície.
- **Não executar `npm install` sem lockfile commitado.**

## Anti-patterns consolidados

1. Userland para o que built-in resolve (ver tabela acima).
2. `__dirname` / `__filename` em vez de `import.meta.dirname` / `import.meta.filename`.
3. `tsx` / `ts-node` para scripts que strip-types resolve.
4. Top-level imports caros em Firebase Functions (custo de cold start).
5. Bloquear o event loop (FS síncrono, loops longos, JSON gigante) — use `worker_threads` ou streaming.
6. Ignorar Permission Model em scripts sensíveis.
7. Specifier sem `node:` para built-ins (`import fs from 'fs'` em vez de `'node:fs'`).
8. CommonJS em código novo.
9. `dotenv` quando `--env-file=.env` resolve.
10. Fixar `node-version` em CI sem coerência com `.nvmrc`/`engines`.

## Política de versão e roadmap

Política: manter sempre a última versão estável; qualquer incompatibilidade vira ADR ([ADR 0004](../../decisions/0004-latest-stable-baseline-and-documented-exceptions.md)).

| Linha | Status (2026-09-28) | Maintenance | EOL |
|---|---|---|---|
| Node 26 | Current, LTS em 2026-10-28 | 2027-10-20 | 2029-04-30 |
| Node 24 (Krypton) | Active LTS | 2026-10-20 | 2028-04-30 |

- Node 26 é o baseline de app, CI, Docker do app, tooling e `tsc`.
- Node 24 permanece apenas onde a plataforma exige: Firebase Functions (E1) e o runtime de prod do App Hosting (E6 provisória; `apps/web` com `engines` `>=24.0.0 <27` e `@types/node@24`, local e CI em 26). Reavaliar quando cada plataforma publicar `nodejs26` GA.
- Ao virar LTS (2026-10-28), atualizar o status deste doc e acompanhar o changelog do 26 por novas remoções/deprecações.
