---
title: Vite
type: stacks
category: frontend
version: 8.3.1
last_updated: 2026-09-29
status: current
upstream: https://vite.dev
migration_upstream: https://vite.dev/guide/migration
tauri_upstream: https://v2.tauri.app/start/frontend/vite/
next_target: 8.x minors
---

# Vite 8

Bundler e dev server do `apps/desktop` (Tauri 2). O `apps/web` não usa Vite: Next 16 compila com Turbopack (`@.contexts/engineering/stacks/frontend/next@16.md`). Vite também é o peer do Vitest 5, na mesma versão do baseline (`@.contexts/engineering/stacks/testing/vitest.md`). Decisão: `@.contexts/engineering/decisions/0007-desktop-and-mobile-shell-with-tauri-2.md`.

**Escopo:** configuração do Vite para o shell desktop (Tauri, React, Tailwind, TanStack Router, aliases, env). Integração nativa: `@.contexts/engineering/stacks/desktop/tauri@2.md`. Rotas: `@.contexts/engineering/stacks/frontend/tanstack-router.md`.

## Versão

Medido em 2026-09-29 (`npm view`):

| Pacote | Versão | Peer relevante |
|---|---|---|
| `vite` | **8.3.1** | engines Node `^20.19 \|\| >=22.12` (Node 26 ok) |
| `@vitejs/plugin-react` | 6.1.1 | `vite ^8.0.0`. `babel-plugin-react-compiler`, `@rolldown/plugin-babel` e `oxc-transform-react` são peers opcionais |
| `@tailwindcss/vite` | 4.3.3 | `vite ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`; mesma versão de `tailwindcss` |
| `@tanstack/router-plugin` | 1.168.41 | `vite >=5`; `@tanstack/react-router ^1.170.40` |

Os quatro entram como `devDependencies` de `apps/desktop`. Versão compartilhada com o Vitest vem do `catalog:` do workspace (`architecture/monorepo.md`, Enforcement).

## O que mudou no 8 (vs 7)

- **Rolldown e Oxc** substituem Rollup e esbuild no build e nas transformações.
- Renomes: `build.rollupOptions` → `build.rolldownOptions`; `worker.rollupOptions` → `worker.rolldownOptions`; `optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`; `esbuild` → `oxc`. As chaves antigas ainda são convertidas automaticamente, mas estão a caminho da remoção. Código novo usa só as novas.
- `build.target` default subiu para Chrome/Edge 111, Firefox 114, Safari 16.4. O Tauri sobrescreve esse valor por plataforma (abaixo).
- Interop CommonJS: o import `default` de CJS segue a mesma regra em dev e build. Código que dependia da heurística antiga pode mudar de comportamento.
- `resolve.mainFields` é respeitado na ordem declarada, sem "format sniffing" entre `browser` e `module`.
- Minificação de CSS é Lightning CSS por default.
- `resolve.tsconfigPaths` (default `false`) resolve `paths` do `tsconfig.json` nativamente.

## `apps/desktop/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }), // antes do plugin React
    react(),
    tailwindcss(),
  ],
  resolve: { tsconfigPaths: true }, // aliases vêm do tsconfig do app; nunca duplicar aqui
  clearScreen: false, // não esconder erro do compilador Rust
  server: {
    port: 5173, // igual ao devUrl de tauri.conf.json
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // WebView2 (Chromium) no Windows; WebKit no macOS e no Linux
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
```

- O bloco `server`/`envPrefix`/`build` é o recomendado pelo guia de Vite do Tauri. `target` fica **abaixo** do default do Vite 8 de propósito, para cobrir as webviews do sistema.
- `server.port` e `strictPort` casam com `build.devUrl` no `tauri.conf.json`. Se a porta estiver ocupada, o dev falha em vez de subir em outra.
- `TAURI_DEV_HOST` é documentado pelo upstream para dev em aparelho físico iOS (`tauri ios dev --force-ip-prompt` ou `--open --host`). Sem ele, o server escuta só em localhost. Aparelho físico Android: não confirmado no upstream (`stacks/desktop/tauri@2.md`, Android).

## Aliases

- Um alias por app, igual ao do web: `"paths": { "@/*": ["./src/*"] }` no `tsconfig.json` de `apps/desktop`, sem `baseUrl` (removido no TS 7; `@.contexts/engineering/stacks/language/typescript@7.md`).
- O Vite lê o alias do tsconfig (`resolve.tsconfigPaths: true`). Não repita aliases em `resolve.alias`: um valor duplicado diverge do tsconfig. Em `vitest.config.ts`, a doutrina atual resolve com `vite-tsconfig-paths` (`stacks/testing/vitest.md`); as duas formas leem a mesma fonte.
- Código de outro pacote entra pelo nome do pacote e pelo `exports` (`@core/client`), nunca por alias apontando para `packages/*/src` (`architecture/monorepo.md`, Fronteiras).
- **Pitfall:** `packages/client` é compilado pelo bundler do app, e um alias `@/` usado dentro do pacote pode colidir com o `@/` do app. A doc do Vite diz que "`paths` only applies to a file matched by a `tsconfig.json` through its `files` or `include`" (`vite.dev/config/shared-options`). Isso indica resolução pelo tsconfig que inclui o arquivo, mas o comportamento com pacote do workspace (symlink em `node_modules`) não foi testado. Até o spike do SP0b confirmar, imports internos de pacote não usam alias.

## Tailwind

- No desktop, Tailwind 4 entra pelo plugin `@tailwindcss/vite`. No Next, entra pelo `@tailwindcss/postcss` (`@.contexts/engineering/stacks/frontend/tailwind@4.md`). A config CSS-first (`@theme`, tokens) é a mesma.
- O desktop importa a mesma folha global de tokens que o web importa, vinda de `packages/client`. O path concreto nasce com o pacote (tokens: `@.contexts/product/design-system.md`).
- A detecção automática de classes não varre pacotes do workspace servidos via `node_modules`. Declare a fonte com `@source` apontando para `packages/client/src` na folha do app, senão classes usadas só em `packages/client` somem do CSS.

## Env

- Só variáveis com prefixo de `envPrefix` chegam ao bundle via `import.meta.env`. Tudo no bundle é **público**: nenhum secret com prefixo `VITE_` (rule `security` §1). `envPrefix: ''` é proibido (o próprio Vite recusa).
- `apps/desktop/src/env.ts` valida `import.meta.env` com Zod no boot (rule `environments`). O resto do código importa `env` de `@/env`.
- `TAURI_ENV_PLATFORM`, `TAURI_ENV_DEBUG` e as demais `TAURI_ENV_*` são injetadas pela CLI do Tauri no build.

## Anti-patterns

- `build.rollupOptions`/`esbuild` em código novo → `build.rolldownOptions`/`oxc`.
- `resolve.alias` duplicando `paths` do tsconfig.
- Subir `build.target` para o default do Vite 8 sem checar a versão mínima de WebView2/WebKit suportada.
- Secret com prefixo `VITE_`.
- Importar `packages/client/src/...` por path relativo ou alias em vez de `@core/client`.
- Plugin do TanStack Router depois do `react()`.

## Referências cruzadas

- `@.contexts/engineering/stacks/desktop/tauri@2.md`, `@.contexts/engineering/stacks/frontend/tanstack-router.md`
- `@.contexts/engineering/stacks/frontend/tailwind@4.md`, `@.contexts/engineering/stacks/frontend/react@19.md`
- `@.contexts/engineering/stacks/testing/vitest.md` (Vite como peer)
- `@.contexts/engineering/architecture/monorepo.md`, `@.contexts/engineering/MEMORY.md`
