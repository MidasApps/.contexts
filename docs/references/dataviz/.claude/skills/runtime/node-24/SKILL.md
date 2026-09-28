---
name: node-24
description: Use ao trabalhar com Node.js 24 — APIs nativas, ESM, workers, perf. Keywords: node, nodejs, runtime.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Node.js 24

LTS atual com ESM-first, fetch nativo estável, test runner builtin, watch mode, permission model experimental, V8 com TLA e melhorias de perf.

## Essência
- **ESM-first:** `"type": "module"` no `package.json`; use `import` em vez de `require`. CJS interop por `import.meta.require` ou `createRequire`.
- **Fetch global** estável: `fetch`, `Request`, `Response`, `FormData`, `Headers` sem polyfill.
- **node:test + node --watch** built-in para teste e dev loop (`node --test`, `node --watch src/main.ts`).
- **node:** prefixo obrigatório para builtins (`import fs from "node:fs/promises"`).
- **Worker threads** para CPU-bound; **cluster** para multi-proc HTTP; **AbortController** em qualquer I/O async.
- **TS direto:** `--experimental-strip-types` permite rodar `.ts` sem build (sem type-check; use tsc para isso).
- **Permission model** (`--permission --allow-fs-read=...`) sandboxa I/O em scripts não-confiáveis.
- **Top-level await** em ESM. `import.meta.url` para path do módulo.

## Procedimento mínimo
1. `package.json` com `"type": "module"`, `"engines": { "node": ">=24" }`.
2. Imports com `node:` prefix; paths com `.js` (ESM) ou alias via tsconfig.
3. I/O: `node:fs/promises`, `node:stream/promises`, `fetch` global.
4. Cancelamento: `AbortController` propagado em fetch/streams.
5. Testes: `node --test` ou Vitest (skill `vitest`).

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
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/runtime/node@24.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
