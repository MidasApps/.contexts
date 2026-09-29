---
title: Tauri
type: stacks
category: desktop
version: 2.12.0
last_updated: 2026-09-29
status: current
upstream: https://v2.tauri.app
security_upstream: https://v2.tauri.app/security/
plugins_upstream: https://v2.tauri.app/plugin/
release_notes: https://v2.tauri.app/release/
next_target: 2.x minors; Tauri 3 não tem release estável nesta data
---

# Tauri 2

Shell nativo do `apps/desktop` para Windows, macOS, Linux, Android e iOS. Um núcleo Rust hospeda a webview do sistema, que carrega a SPA Vite + React 19 empacotada no binário. Decisão: `@.contexts/engineering/decisions/0007-desktop-and-mobile-shell-with-tauri-2.md`. Layout e fronteiras: `@.contexts/engineering/architecture/monorepo.md`.

**Escopo:** configuração do Tauri, capabilities, IPC, CSP, rede até o `/v1`, updater, Android e plugins. Bundler: `@.contexts/engineering/stacks/frontend/vite.md`. Roteamento: `@.contexts/engineering/stacks/frontend/tanstack-router.md`. Componentes: `@.contexts/engineering/stacks/frontend/react@19.md`. Regras de segurança que valem aqui também: `@.contexts/engineering/rules/security.md`.

## Versão e toolchain

Medido em 2026-09-29 (`npm view`, crates.io, `static.rust-lang.org`):

| Peça | Versão | Nota |
|---|---|---|
| `@tauri-apps/cli`, `@tauri-apps/api` | **2.12.0** | Mesma versão nos dois (pin em `MEMORY.md`). |
| crate `tauri` | 2.12.0 | `rust-version` 1.90 (MSRV). |
| crate `tauri-build` | 2.7.0 | Versionado à parte do `tauri`. |
| Rust | canal **stable** (1.98.1 em 2026-09-01) | Via `rustup`. A máquina de medição tinha 1.95.0, acima do MSRV. |

- Tauri recebe a versão Rust pelo canal `stable` do `rustup`, não por pin fixo no framework. Um `rust-toolchain.toml` com `channel = "stable"` em `apps/desktop/src-tauri/` deixa o CI e o dev no mesmo canal.
- Mantenha `@tauri-apps/api` e o crate `tauri` na mesma major.minor. O mesmo vale para cada plugin: `@tauri-apps/plugin-<x>` no npm e `tauri-plugin-<x>` no crates.io.
- **Pitfall medido:** as duas metades de um plugin nem sempre saem juntas. Em 2026-09-29, `@tauri-apps/plugin-http` estava em 2.7.0 e o crate `tauri-plugin-http` em 2.8.0; `@tauri-apps/plugin-updater` e o crate estavam ambos em 2.13.0. Confira os dois registries antes de subir um plugin.

## Estrutura do app

```
apps/desktop/
  package.json            scripts dev/build do Vite + "tauri": "tauri"
  vite.config.ts          ver stacks/frontend/vite.md
  index.html
  src/
    main.tsx              cria o router e monta <RouterProvider>
    routes/               rotas file-based (TanStack Router)
    app-providers/        providers do app + adapters Tauri dos ports de packages/client
    env.ts                env do cliente validada com Zod no boot
  src-tauri/
    Cargo.toml  build.rs  tauri.conf.json  rust-toolchain.toml
    capabilities/         uma capability por janela/plataforma
    src/lib.rs            builder, plugins, comandos do app
    gen/android/  gen/apple/   gerados por `tauri android|ios init`
```

`apps/desktop` só compõe (ADR 0006): não contém `views`, `widgets`, `features`, `entities` nem `shared`. Esses vêm de `@core/client`.

## `tauri.conf.json`: o essencial

```json
{
  "productName": "<app>",
  "identifier": "<reverse-dns-do-app>",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "security": {
      "csp": "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost https://<host-da-api>; img-src 'self' asset: blob: data:; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": { "active": true, "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<conteúdo da chave pública, não um path>",
      "endpoints": ["https://<host-de-updates>/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

- `devUrl` usa a mesma porta do `server.port` do Vite, com `strictPort: true`.
- `frontendDist` aponta para o output do Vite. O app de produção nunca carrega URL remota.
- O `identifier` é permanente: vira o application id no Android e o bundle id no iOS.

## Capabilities e permissions

O frontend só alcança o que uma capability concede. Arquivos em `src-tauri/capabilities/`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main",
  "windows": ["main"],
  "platforms": ["linux", "macOS", "windows", "android", "iOS"],
  "permissions": [
    "core:default",
    "opener:allow-open-url",
    "deep-link:default",
    "notification:default"
  ]
}
```

- Identificadores seguem `core:<área>:<permissão>` e `<plugin>:<permissão>` (`core:window:allow-set-title`, `opener:allow-open-url`). Escopos (paths, URLs) restringem permissões de plugins como `fs` e `http`.
- Uma janela coberta por duas capabilities recebe a **união** das permissões. Separe por janela e por plataforma (`platforms`) em vez de empilhar.
- Updater só em capability de desktop (`platforms: ["linux", "macOS", "windows"]`): o plugin não existe no mobile.
- **Não use `remote.urls`.** No Linux e no Android o Tauri não distingue request de iframe de request da janela.
- Comandos do próprio app: registre-os em `build.rs` com `tauri_build::AppManifest::new().commands(&[...])`. Isso gera `allow-<comando>`/`deny-<comando>` e nega os comandos não listados.
- Mudança em `capabilities/` é mudança de superfície de segurança: o PR declara isso (`@.contexts/engineering/processes/pull-requests.md`).

## IPC seguro

- **Commands** (`invoke`) são request/response com payload serializado. **Events** são one-way, para notificação de ciclo de vida. **Channels** servem para streaming do Rust para a webview.
- Todo argumento de comando é input não confiável: tipe-o com `serde` e valide range, tamanho e path no Rust antes de agir (rule `validation`, aplicada ao lado Rust).
- Nada de comando genérico (`run_shell`, `read_file(path)` sem escopo, `http_request(url)` livre). Use o plugin oficial com escopo, ou um comando estreito com nome de caso de uso.
- Resposta de comando que carrega dado externo (arquivo, rede) passa por schema Zod ao entrar no `packages/client`, como qualquer boundary (`@.contexts/engineering/rules/validation.md`).
- Secrets de servidor (chaves de provedor de IA, service account) nunca vão para o binário nem para o Rust do app: tudo que é privilegiado fica atrás do `/v1` (rule `security` §1).
- **Isolation pattern** (`app.security.pattern.use = "isolation"`): o upstream recomenda. Ele intercepta e cifra (AES-GCM) toda mensagem IPC num iframe sandbox. Limitações documentadas: no Windows o script do app de isolamento precisa ser inline, e ES modules não carregam nele. Adoção no core: **não confirmada**, avaliar no spike do SP0b.

## CSP

- Configure em `app.security.csp`. No build, o Tauri acrescenta nonces e hashes dos assets empacotados; declare só o que é do app.
- `connect-src` inclui `ipc: http://ipc.localhost` (IPC) e o host HTTPS do `/v1`. Nada de `*`.
- Sem `unsafe-eval`. WebAssembly exige `'wasm-unsafe-eval'` em `script-src`, só com justificativa.
- A política do web continua em `rule security` §6. A CSP do desktop é outra, mas segue a mesma regra de ser restritiva.

## Rede até o `/v1`

- O desktop fala só com o `/v1` (ADR 0007) sobre HTTPS, com `Authorization: Bearer <Firebase ID token>`. Cookie de sessão é mecanismo do web. O fluxo completo de autenticação fica no ADR de tenancy e acesso (SP0a Task 5).
- **Origem da webview empacotada:** `http://tauri.localhost` no Windows e no Android (default de `useHttpsScheme: false`), `tauri://localhost` no macOS e no Linux. Origem no iOS: não confirmada. O `/v1` lista essas origens explicitamente no CORS (rule `security` §6: nunca `*`, nunca ecoar `Origin`).
- **`useHttpsScheme`:** trocar o valor entre releases move IndexedDB, cookies e localStorage para outra origem, e o dado anterior fica inacessível. Escolha uma vez antes do primeiro release.
- `fetch` da webview (sujeito a CORS) é o caminho default, porque `packages/client` usa o mesmo cliente HTTP no web e no desktop. O plugin `http` (fetch executado no Rust, com escopo de URL) só entra por motivo registrado, e o escopo lista hosts exatos.
- Token no desktop: use armazenamento do sistema quando houver adapter para isso. Não use `localStorage` para refresh token (rule `security` §2). O adapter concreto é spike do SP0b.

## Android

- Pré-requisitos: Android Studio (SDK Platform, Platform-Tools, NDK, Build-Tools, Command-line Tools), `JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`, e os targets Rust:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```
- `pnpm tauri android init` gera `src-tauri/gen/android/`, que é versionado. `pnpm tauri android dev` roda no emulator ou no aparelho; `--open` abre o Android Studio.
- **Emulator → máquina host:** dentro do emulator, `127.0.0.1` é o próprio emulator. Serviços locais da máquina (Next com o `/v1`, Firebase Emulator Suite, Postgres) são alcançados por **`10.0.2.2`**, o alias do loopback do host. A URL da API do ambiente `local` no Android usa esse host, e vem de env validada, nunca de literal (rule `environments`).
- Aparelho físico: o dev server escuta no IP informado por `TAURI_DEV_HOST`, e o Vite usa esse host e o HMR em `ws` (ver `stacks/frontend/vite.md`).
- HTTP em claro para `10.0.2.2` no dev: o comportamento da política de cleartext do projeto Android gerado não foi confirmado. Verificar no spike.
- Assinatura de release: keystore gerado com `keytool` e `src-tauri/gen/android/keystore.properties` (`password`, `keyAlias`, `storeFile`) lido pelo `build.gradle.kts`. Keystore e `keystore.properties` **nunca** entram no git. No CI, o keystore vai em base64 como secret (`@.contexts/engineering/contracts/secrets.md`).
- Push remoto (FCM) e App Check: sem plugin oficial. É o ponto aberto do ADR 0007 (spec §14 item 5).

## Updater (desktop)

- Assinatura é obrigatória e não pode ser desligada. Gere o par com `pnpm tauri signer generate -w <path-fora-do-repo>`.
- O build de release lê `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` de secret do CI. A chave privada nunca entra no repositório e tem backup: **sem ela não se publica mais update**.
- `plugins.updater.pubkey` recebe o conteúdo da chave pública. `endpoints` aceitam `{{current_version}}`, `{{target}}` e `{{arch}}`.
- O JSON estático exige `version`, `platforms.<target>.url` e `platforms.<target>.signature`. A assinatura é o conteúdo do `.sig` gerado, não um path nem uma URL.
- No frontend: `check()` e depois `downloadAndInstall()` de `@tauri-apps/plugin-updater`, com permissão `updater:default` na capability de desktop. Encapsule num adapter (ver abaixo).

## Plugins como ports (HAL)

`packages/client` não importa `@tauri-apps/*`. A feature depende de um port em `shared/lib/<capacidade>`. O app injeta o adapter pelos providers: Tauri em `apps/desktop/src/app-providers/`, web em `apps/web`.

| Port (em `packages/client`) | Adapter Tauri | Plataformas do plugin | Adapter web |
|---|---|---|---|
| `shared/lib/router` | TanStack Router | todas | Next App Router |
| abrir URL externa | `@tauri-apps/plugin-opener` | desktop + mobile | `window.open` |
| notificação local | `@tauri-apps/plugin-notification` | desktop + mobile (Windows só instalado) | Notifications API |
| deep link | `@tauri-apps/plugin-deep-link` | desktop + mobile | rota do Next |
| armazenamento local chave-valor | `@tauri-apps/plugin-store` | desktop + mobile | storage do browser |
| atualização do app | `@tauri-apps/plugin-updater` | **só desktop** | no-op |

- Port novo segue a mesma forma: interface tipada no `packages/client`, um adapter por app, e teste do consumidor contra fake em memória (rule `testing`).
- Plugin só desktop (`updater`, `single-instance`, `window-state`, `global-shortcut`) é registrado em `lib.rs` atrás de `#[cfg(desktop)]`.
- Versões dos plugins: na tabela de `@.contexts/engineering/stacks/VERSIONS.md`, conferidas no npm e no crates.io.

## Anti-patterns

- Carregar o site do `apps/web` na webview (URL remota) em vez da SPA empacotada.
- `remote.urls` numa capability, ou `core:default` somado a permissões amplas de `fs`/`shell` "para testar".
- Comando Rust que executa shell ou lê qualquer path vindo do JavaScript.
- `import { invoke } from '@tauri-apps/api/core'` dentro de `packages/client` → port + adapter no app.
- Chave do updater ou keystore no repositório, em `.env` commitado ou em log.
- Hardcode de `http://10.0.2.2:3000` no código → env do ambiente `local`.
- Mudar `useHttpsScheme` depois do primeiro release.
- Subir só metade de um plugin (npm sem crate, ou o inverso).

## Referências cruzadas

- Decisão: `@.contexts/engineering/decisions/0007-desktop-and-mobile-shell-with-tauri-2.md`; layout: `@.contexts/engineering/architecture/monorepo.md`.
- Pins: `@.contexts/engineering/MEMORY.md` (linha Desktop), `@.contexts/engineering/stacks/VERSIONS.md`.
- Segurança: `@.contexts/engineering/rules/security.md`; secrets de CI: `@.contexts/engineering/contracts/secrets.md`.
- Ambientes e host local: `@.contexts/engineering/processes/environments.md`.
- i18n no desktop (`use-intl`): `@.contexts/engineering/rules/internationalization.md`.
