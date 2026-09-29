---
name: node-26
description: "Use ao trabalhar com Node.js 26 (baseline 26.10.0) — APIs nativas, ESM, type stripping, permission model, workers, perf. Keywords: node, nodejs, runtime, engines, nvmrc, strip-types, --permission."
---
# Node.js 26

Baseline **26.10.0** (linha Current, LTS em 2026-10-28; política "última estável", ver ADR 0004). ESM-first, fetch nativo, test runner builtin, watch mode, type stripping e permission model estáveis, Temporal ligada por padrão, V8 14.6. **Exceção E1:** o deploy de Firebase Functions roda `nodejs24`.

## Essência
- **ESM-first:** `"type": "module"` no `package.json`; use `import` em vez de `require`. CJS interop por `createRequire(import.meta.url)` (de `node:module`).
- **Fetch global** estável: `fetch`, `Request`, `Response`, `FormData`, `Headers` sem polyfill.
- **node --watch** built-in para dev loop (`node --watch src/main.ts`). Testes rodam em Vitest; `node:test` só na exceção de libs internas descrita no stack doc.
- **node:** prefixo obrigatório para builtins (`import fs from "node:fs/promises"`).
- **Worker threads** para CPU-bound; **cluster** para multi-proc HTTP; **AbortController** em qualquer I/O async.
- **TS direto:** `node script.ts` roda `.ts` sem build e sem flag (type stripping Stable desde v25.2.0/v24.12.0; `--no-strip-types` desliga). Não faz type-check (use `tsc --noEmit`) e não cobre `enum`, `namespace` com runtime, decorators legados nem JSX. `--experimental-transform-types` foi removida no 26.
- **Permission model** (Stable desde v23.5.0/v22.13.0): `--permission` bloqueia FS, rede, child_process, worker, addons, WASI e FFI até liberar com `--allow-fs-read=...`, `--allow-net`, `--allow-child-process` etc. `--allow-net` existe desde v25.0.0 (Stability 1.1) e **não existe no Node 24** das Functions. `--permission-audit` só registra violações.
- **Top-level await** em ESM. `import.meta.url` para path do módulo.

## Procedimento mínimo
1. `package.json` com `"type": "module"`, `"engines": { "node": ">=26.0.0 <27" }` (exceção: pacote de Firebase Functions fica em `nodejs24` e `">=24.0.0 <25"`; ver ADR 0004).
2. Imports com `node:` prefix. `.ts` rodado direto por type stripping: imports relativos com extensão `.ts` (`allowImportingTsExtensions` + `noEmit`; strip-types não resolve alias). Código com bundler (Next): alias `@/` do tsconfig, sem extensão (ver `typescript@7.md`).
3. I/O: `node:fs/promises`, `node:stream/promises`, `fetch` global.
4. Cancelamento: `AbortController` propagado em fetch/streams.
5. Testes: Vitest, runner do projeto (skill `vitest`).

## Anti-patterns
- `require("fs")` em projeto ESM → `import fs from "node:fs/promises"`.
- Polyfill de fetch (`node-fetch`) → remover, usar global.
- `process.exit(1)` em handler → throw + handler de topo.
- I/O sync (`fs.readFileSync`) em request handler → versão async.

## Mini-exemplo
```ts
import { readFile } from "node:fs/promises";
const ac = new AbortController();
const res = await fetch(url, { signal: ac.signal });
const json = await res.json();
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/runtime/node@26.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
