# 0007. Desktop e mobile com Tauri 2 desde a v1

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** projeto DDC / spec do core agêntico (`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`, D2)
- **Tags:** `engineering`, `desktop`, `mobile`, `tauri`, `frontend`
- **Complements:** [0006](0006-monorepo-layout-and-package-boundaries.md) (`apps/desktop` só compõe e consome `packages/client`, como o `apps/web`) e [0004](0004-latest-stable-baseline-and-documented-exceptions.md) (Tauri, Vite e TanStack Router entram pelo baseline, sem exceção nova).

## Context

A v1 do core agêntico precisa rodar no navegador e como app instalado no desktop (Windows, macOS, Linux) e no mobile. A 0006 já reservou `apps/desktop` no monorepo e decidiu que web e desktop consomem a mesma camada FSD em `packages/client`, incluindo a biblioteca Atomic em `shared/ui` (shadcn estilo `new-york` sobre Radix e Tailwind 4, `product/design-system.md`).

Três restrições vêm da spec:

- a área do usuário é a mesma nas duas superfícies, sem cópia de `views`, `widgets`, `features`, `entities` e `shared`;
- a API é o `/v1` em Route Handlers do Next, usado pelo web e pelo desktop (D5);
- o `/admin` é só web.

A doutrina de frontend (`stacks/frontend/next@16.md`, `react@19.md`) cobre só o app Next. Não havia decisão sobre shell nativo, bundler fora do Next nem roteamento fora do App Router.

## Decision Drivers

- **Reuso integral da UI.** Os componentes de `packages/client` renderizam DOM (Radix, Tailwind). O shell precisa rodar esse código sem uma segunda biblioteca de UI.
- **Cobertura de plataforma na v1.** Desktop nos três sistemas e mobile, com uma base de código de shell.
- **Capacidades nativas.** Deep link, notificações, armazenamento local, abrir URL externa e atualização do app instalado.
- **Menor privilégio verificável.** O código web do shell só alcança APIs nativas declaradas, e a declaração é revisável no PR (rule `security`).
- **Atualização segura.** Update do app instalado com assinatura verificada.
- **Custo de toolchain e de CI.** Cada runtime extra no pipeline é custo permanente.
- **Tamanho e consumo.** O instalador e a memória em uso importam em desktop e Android.

## Considered Options

1. **Web-first PWA, shells nativos depois.** A v1 sai só como PWA do `apps/web`; desktop e mobile nativos ficam para uma fase posterior.
2. **Tauri 2 desde a v1.** Um núcleo Rust com a webview do sistema (WebView2 no Windows, WKWebView no macOS e iOS, WebKitGTK no Linux, Android System WebView). O frontend é uma SPA Vite + React 19 que importa `packages/client`. O mesmo projeto gera binários de desktop, Android e iOS.
3. **Expo (React Native).** App mobile com componentes nativos e rotas do Expo Router, com código de lógica compartilhado via pacotes do workspace.

## Pros and Cons of the Options

**1. PWA primeiro**
- \+ Nenhum toolchain nativo; um deploy só.
- \+ Reuso total da UI, sem trabalho adicional.
- − Capacidades nativas dependem do navegador e variam por plataforma (instalação, notificações e acesso a arquivos não são uniformes).
- − Sem canal de update do app instalado sob controle do projeto nem distribuição por loja sem empacotamento extra.
- − Adiar o shell adia as decisões que ele força: roteamento fora do Next, autenticação fora de cookie de sessão, CORS no `/v1`. Elas entram depois sobre código já escrito presumindo só o web.

**2. Tauri 2**
- \+ Roda o DOM do `packages/client` sem adaptação; só o roteamento e os providers mudam (`architecture/monorepo.md`).
- \+ Capabilities e permissions: toda API nativa exposta à webview é declarada por janela e plataforma em `src-tauri/capabilities/`, e o que não está declarado é negado.
- \+ Updater com assinatura obrigatória (não dá para desligar a verificação).
- \+ Usa a webview do sistema: instalador menor que o de um runtime com Chromium embutido.
- − Rust no toolchain de dev e CI (rustup, targets Android, Android Studio/NDK, Xcode para iOS).
- − Quatro engines de webview: CSS e APIs web precisam funcionar em todas.
- − Parte dos plugins oficiais é só desktop (updater, single-instance, window-state). Push remoto (FCM/APNs) não tem plugin oficial.

**3. Expo / React Native**
- \+ UI nativa no mobile; ecossistema maduro de push e de update OTA.
- − React Native não renderiza DOM: `shared/ui` (Radix, Tailwind, shadcn) não roda. Seria preciso uma segunda biblioteca de UI e uma segunda árvore de `views`/`widgets`, o que viola o driver de reuso e a 0006.
- − Não cobre desktop. Desktop exigiria um segundo shell, e a plataforma teria dois runtimes nativos.

## Decision Outcome

**Opção 2: Tauri 2 desde a v1**, no baseline de `MEMORY.md` (Tauri 2.12.0, Vite 8.3.1, TanStack Router 1.170.40):

- `apps/desktop` é um projeto Tauri 2 cujo frontend é uma SPA Vite + React 19 empacotada no binário (`frontendDist`). A webview não carrega o site do `apps/web` e nenhuma capability usa `remote.urls`.
- O desktop consome `packages/client` como o web. Só o roteamento (TanStack Router, adapter do port `shared/lib/router`) e os providers (`apps/desktop/src/app-providers/`) são do app.
- Dados e mutações vão pelo `/v1` sobre HTTPS. O desktop não tem Server Components nem Server Actions.
- Mobile sai do mesmo projeto (`tauri android`, `tauri ios`). Android é o alvo dos spikes do SP0 (spec §14 item 5); build de iOS exige macOS com Xcode.
- O `/admin` existe só em `apps/web`: a árvore de rotas do desktop não registra nenhuma rota de administração.
- Plugins nativos entram como adapters de ports do `packages/client`. A feature depende do port, e o adapter Tauri mora em `apps/desktop`.

Convenções operacionais: `@.contexts/engineering/stacks/desktop/tauri@2.md`, `@.contexts/engineering/stacks/frontend/vite.md` e `@.contexts/engineering/stacks/frontend/tanstack-router.md`.

Por que não a 1: resolve o curto prazo, mas deixa o shell nativo como retrofit sobre código que presume o Next, e não entrega update controlado nem capacidades nativas uniformes. Por que não a 3: quebra o reuso de UI que motivou a 0006 e não resolve desktop.

**Versões:** Tauri, Vite e TanStack Router estão no `latest` medido em 2026-09-29. Nenhuma linha nova na tabela de exceções da 0004.

## Consequences

**Melhora:**
- Uma área do usuário, três destinos (browser, desktop, mobile), sem fork de UI.
- A superfície nativa exposta ao JavaScript fica declarada em arquivo e passa por review (`src-tauri/capabilities/*.json`).
- A distribuição do desktop tem canal próprio de update assinado.
- Roteamento, autenticação e CORS do `/v1` são desenhados para dois clientes desde o início.

**Piora:**
- Rust, targets Android e toolchains de plataforma entram no dev e no CI. O build de iOS precisa de runner macOS.
- A matriz de teste de UI cresce: quatro engines de webview, além dos browsers do web.
- O `/v1` precisa aceitar a origem da webview do Tauri (`http://tauri.localhost` no Windows e no Android, `tauri://localhost` no macOS e no Linux; origem no iOS não confirmada) numa allowlist de CORS explícita, e autenticar por `Authorization: Bearer`. Cookie de sessão same-site não serve ao desktop.
- Features de `packages/client` usadas no desktop não podem depender de Server Action nem de RSC para buscar ou mutar dados.
- Duas chaves de assinatura novas para guardar e rotacionar: a do updater (perdê-la impede publicar update) e o keystore Android.

**Pontos em aberto (spikes do SP0b, spec §14 item 5):**
- Push remoto (FCM) no Tauri, principalmente Android: sem plugin oficial; exige plugin da comunidade ou plugin próprio.
- Firebase App Check e o fluxo de login do Firebase Auth dentro da webview (origem customizada, domínios autorizados).
- Estratégia de autenticação do desktop contra o `/v1`: formalizada no ADR de tenancy e acesso (SP0a Task 5).

**Arquivos que passam a mudar:**
- Novos `stacks/desktop/tauri@2.md`, `stacks/frontend/vite.md`, `stacks/frontend/tanstack-router.md`.
- `MEMORY.md` (índice de stacks e ADRs), `stacks/VERSIONS.md` (Rust e pacotes auxiliares do shell) e o índice de `decisions/README.md`.
- A topologia de runtime (SP0a Task 4) e o ADR de i18n (`use-intl` no desktop, SP0a Task 8) partem desta decisão.

## References

- `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §2 (D2, D5), §3, §6, §14
- `@.contexts/engineering/architecture/monorepo.md`
- `@.contexts/engineering/rules/security.md` (§2 autenticação, §6 headers e CORS)
- [0004](0004-latest-stable-baseline-and-documented-exceptions.md), [0006](0006-monorepo-layout-and-package-boundaries.md)
- https://v2.tauri.app/security/ · https://v2.tauri.app/security/capabilities/ · https://v2.tauri.app/plugin/updater/ · https://v2.tauri.app/plugin/
- https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html (`useHttpsScheme` e origem por plataforma)
