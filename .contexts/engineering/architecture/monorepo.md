---
title: Monorepo
type: architecture
status: active
last_updated: 2026-09-29
upstream: https://turborepo.com/docs
---

# Monorepo

**Escopo: repositório inteiro.** Define como o `src/` único da doutrina se distribui em apps e pacotes de um workspace pnpm + Turborepo. Não redefine a estrutura interna de nenhum pacote: FSD, Feature-Based, Hexagonal, Atomic e a localização de schemas continuam nos documentos próprios. Decisão: `@.contexts/engineering/decisions/0006-monorepo-layout-and-package-boundaries.md`.

## Conceito canônico

Um monorepo guarda várias unidades implantáveis e bibliotecas internas num único repositório e num único histórico. O workspace do package manager liga as unidades entre si por dependência declarada (`workspace:*`), sem publicação em registry. Um orquestrador de tasks conhece o grafo de dependências entre pacotes e roda `build`, `lint` e `test` na ordem certa, com cache e execução só do que foi afetado.

A divisão usual:

- **Apps**: alvos de deploy. Compõem pacotes e não são importados por ninguém.
- **Packages**: bibliotecas internas com API pública declarada no `exports` do `package.json`.
- **Grafo acíclico**: um pacote só importa o que declara como dependência; o grafo entre pacotes não tem ciclo.

O ganho estrutural é transformar fronteiras de pasta em fronteiras de pacote, que o lint e o package manager conseguem verificar. O custo é configuração por pacote e a disciplina de manter uma versão única de cada dependência compartilhada.

## Como o time adotou

pnpm workspaces + Turborepo; versões na linha Monorepo de `@.contexts/engineering/MEMORY.md` (invariantes 6 e 8), não repetidas aqui. `.contexts/` e `.claude/` ficam na raiz: quem clona só o harness leva esses dois diretórios; quem clona tudo leva também `apps/`, `packages/` e `modules/`.

### Layout

```
.contexts/ .claude/          harness DDC
apps/
  web/          Next 16: só roteamento (src/app/(app)/, src/app/admin/, src/app/v1/)
  desktop/      Tauri 2 + Vite + React 19: só roteamento + plugins nativos
  mastra/       servidor Mastra (src/mastra/index.ts), imagem Docker para Cloud Run
  functions/    Firebase Functions Gen 2 (nodejs24, ADR 0004 E1)
packages/
  client/       FSD: src/{views,widgets,features,entities,shared}; shared/ui em Atomic
  contracts/    src/contracts/<context>/, events/, primitives/ + registry + catálogo
  services/     src/services/<context>/ em hexagonal
  agents/       agents, tools, skills, workflows, processors, scorers
  i18n/         mensagens e configuração de locale
  config/       tsconfig base, config de ESLint e presets de Vitest compartilhados
modules/        vazio no core; modules/example só prova o contrato de módulo
docs/           openapi/v1.yaml, catálogo gerado, specs e planos
pnpm-workspace.yaml  turbo.json  package.json
```

`pnpm-workspace.yaml` declara `apps/*`, `packages/*` e `modules/*`. O `/admin` existe só em `apps/web`.

**Nome dos pacotes.** Os pacotes do core se chamam `@core/<pkg>` (`@core/client`, `@core/contracts`, `@core/services`, `@core/agents`, `@core/i18n`, `@core/config`) e declaram `private: true`: nunca são publicados em registry. Uma aplicação derivada pode renomear o escopo. O naming dos pacotes de módulo fica em `contracts/agents.md`, a ser criado em SP0a Task 7.

### Papel de cada pacote

| Pacote | Contém | Doutrina interna |
|---|---|---|
| `packages/client` | Camadas FSD `views`, `widgets`, `features`, `entities`, `shared`; `shared/ui` com a biblioteca Atomic | `@.contexts/engineering/architecture/fsd.md`, `@.contexts/engineering/architecture/atomic-design.md` |
| `packages/contracts` | Schemas Zod client ↔ server, eventos, primitivos, registry de metadados e geração do catálogo | `@.contexts/engineering/contracts/schemas.md` |
| `packages/services` | Um bounded context por pasta, interior hexagonal, `services/shared/` para clients compartilhados | `@.contexts/engineering/architecture/feature-based.md`, `@.contexts/engineering/architecture/hexagonal.md` |
| `packages/agents` | Agents, tools, skills, workflows, processors e scorers do Mastra | `@.contexts/engineering/stacks/ai/mastra-sdk.md`; contrato em `contracts/agents.md`, a ser criado em SP0a Task 7 |
| `packages/i18n` | Catálogos de mensagens ICU e resolução de locale | `@.contexts/engineering/rules/internationalization.md` |
| `packages/config` | Configuração compartilhada de tooling; só `devDependency`, consumida por `extends` de tsconfig e ESLint (não é import de código) | `@.contexts/engineering/stacks/language/typescript@7.md` |

Contextos de backend do core, cada um em `packages/services/src/services/<context>/`: `identity`, `tenancy`, `access`, `profile`, `conversations`, `knowledge`, `connectors`, `audit`, `usage`, `notifications`.

### Mapeamento: path da doutrina → path no monorepo

A doutrina escreve caminhos a partir de `src/`. No monorepo, leia cada um pela tabela. O interior de cada pasta não muda.

| Path na doutrina | Path no monorepo |
|---|---|
| `src/app/` (roteamento do Next) | `apps/web/src/app/` |
| `src/app/v1/<resource>/route.ts` | `apps/web/src/app/v1/<resource>/route.ts` (re-exporta o driving adapter de `packages/services`) |
| `src/app/<rota>/actions.ts` | `apps/web/src/app/<rota>/actions.ts` (wrapper `"use server"` de uma linha) |
| `src/app-providers/` (camada FSD `app`) | `apps/<app>/src/app-providers/` (providers diferem entre Next e Tauri) |
| `src/{views,widgets,features,entities,shared}/` | `packages/client/src/{views,widgets,features,entities,shared}/` |
| `src/shared/ui/{atoms,molecules,organisms,templates}/` | `packages/client/src/shared/ui/{atoms,molecules,organisms,templates}/` |
| `src/<layer>/<slice>/model/<nome>.schema.ts` | `packages/client/src/<layer>/<slice>/model/<nome>.schema.ts` |
| `src/contracts/<context>/` | `packages/contracts/src/contracts/<context>/` |
| `src/contracts/events/`, `src/contracts/primitives/` | `packages/contracts/src/contracts/events/`, `packages/contracts/src/contracts/primitives/` |
| `src/services/<context>/` | `packages/services/src/services/<context>/` |
| `src/services/shared/` | `packages/services/src/services/shared/` |
| `src/services/<context>/application/use-cases/<uc>.schema.ts` | `packages/services/src/services/<context>/application/use-cases/<uc>.schema.ts` |
| `src/mastra/index.ts` | `apps/mastra/src/mastra/index.ts` (só registra o que vem de `packages/agents`) |
| Handler de Function | `apps/functions/src/` (re-exporta o driving adapter de `packages/services`) |
| `src/env.ts` | `apps/<app>/src/env.ts` (cada app valida as próprias env vars no boot) |
| `e2e/` | `apps/<app>/e2e/` |
| `docs/openapi/v1.yaml` | `docs/openapi/v1.yaml` (raiz, gerado de `packages/contracts`) |

### Fronteiras de import

| Pacote | Pode importar | Não pode importar |
|---|---|---|
| `apps/*` | qualquer pacote de `packages/*`; `modules/*` só no registro de módulos (`apps/<app>/modules.config.ts`) | outro app; `modules/*` fora do arquivo de registro |
| `packages/client` | `contracts`, `i18n` | `services`, `agents`, `apps/*` |
| `packages/services` | `contracts`, `i18n` (mensagens localizadas, por exemplo em `notifications`) | `client`, `agents`, `apps/*` |
| `packages/agents` | `contracts`, o que o `exports` de `@core/services` expõe (use cases e os tipos e erros de domínio que ele re-exporta) | `client`, `apps/*`, import profundo no interior de um contexto (`services/<context>/domain/...`, `adapters/...`) |
| `packages/contracts` | nenhum pacote do workspace | todos |
| `packages/i18n` | nenhum pacote do workspace | todos |
| `packages/config` | nenhum pacote do workspace | todos (é `devDependency`; `extends` de tsconfig/ESLint não conta como import de código) |
| `packages/*` | — | `modules/*` (o core nunca importa um módulo específico) |
| `modules/*` | regras próprias em `contracts/agents.md`, a ser criado em SP0a Task 7 | `apps/*` |

- Import entre pacotes só pelo nome do pacote e pelo que o `exports` do `package.json` expõe. Nada de caminho relativo atravessando pacotes nem import profundo em `src/` de outro pacote.
- O `exports` segue a regra de barrel da ADR 0003: API pública mínima, named exports, sem `export *`.
- Dentro de um pacote valem as regras internas: regra de dependência do FSD em `packages/client`, anéis do hexagonal em `packages/services`.
- Um módulo em `modules/<name>/` declara o que oferece via `defineModule()`. O único ponto em que o core toca um módulo é o registro em `apps/<app>/modules.config.ts`; nenhum pacote de `packages/*` importa `modules/*`. O contrato de `defineModule()` e as regras de import internas do módulo ficam em `contracts/agents.md`, a ser criado em SP0a Task 7.

### Enforcement

- **`eslint-plugin-boundaries`** (versão em `@.contexts/engineering/stacks/VERSIONS.md`; roda no ESLint da E3, ADR 0004): cada pacote e cada camada FSD é um tipo de elemento declarado por padrão de path; a tabela de fronteiras acima vira a regra `boundaries/dependencies`. A config mora em `packages/config`.
- **Dependência declarada.** O `node_modules` do pnpm não expõe dependência não declarada: import de pacote ausente do `package.json` falha na resolução.
- **Versão única.** Dependência compartilhada entre pacotes usa a mesma versão em todo o workspace (invariante 8 da `MEMORY.md`), declarada uma vez no `catalog:` do `pnpm-workspace.yaml`.
- **`engines.node`:** faixas da invariante 6 da `MEMORY.md`, uma para a raiz, os apps e os pacotes e outra para `apps/functions` (E1) e `apps/web` (E6, runtime do App Hosting, ADR 0009). `packageManager` na raiz com a versão do pnpm da `MEMORY.md`.

### Pipelines Turbo

`turbo.json` (chave `tasks`) define as tasks que os scripts da raiz chamam. A tabela lista as tasks do core e não é exaustiva: pacotes e módulos podem acrescentar outras.

| Script da raiz | Task Turbo | Configuração |
|---|---|---|
| `pnpm dev` | `dev` | `persistent: true`, `cache: false`; sobe os processos de dev dos apps (ambiente local em `@.contexts/engineering/processes/environments.md` §9) |
| `pnpm build` | `build` | `dependsOn: ["^build"]`, `outputs` por app |
| `pnpm lint` | `lint` | inclui `eslint-plugin-boundaries` |
| `pnpm typecheck` | `typecheck` | `tsc --noEmit` por pacote |
| `pnpm test` | `test` | Vitest por pacote |
| `pnpm test:e2e` | `test:e2e` | Playwright em `apps/<app>/e2e/` |
| `pnpm contracts:catalog` | `contracts:catalog` | gera os artefatos de `packages/contracts`; `outputs: ["docs/catalog/**", "docs/openapi/**"]` |
| `pnpm contracts:check` | `contracts:check` | regenera catálogo e OpenAPI de `packages/contracts` e falha se houver diff |
| `pnpm seed:local` | `seed:local` | `cache: false`; popula emulators e Postgres locais |

No CI, `turbo run <task> --affected` roda só pacotes afetados pela mudança e seus dependentes. Fluxo de CI e deploy: `@.contexts/engineering/processes/deploy.md`.

## Critérios de aplicação

### Quando o monorepo se aplica bem

- Mais de um alvo de deploy com runtimes ou bundlers diferentes compartilhando código.
- Doutrina e código mudam juntos no mesmo PR.
- Fronteiras entre frontend, backend e agentes precisam de verificação mecânica.

### Quando gera fricção sem retorno

- Um único app sem código compartilhado: um `src/` basta e a doutrina se aplica como está.
- Uma aplicação derivada que clonou só o harness e tem um único alvo: pode manter `src/` único. A doutrina de `src/` continua válida; a tabela de mapeamento só se aplica a quem adota este layout.

### Coexistência com outros modelos

O monorepo decide **em qual pacote** o código mora. FSD, Feature-Based, Hexagonal, DDD, Clean Architecture e Atomic decidem **como** o interior de cada pacote se organiza. Nenhum pacote cria uma segunda raiz para esses modelos: `packages/client` não ganha `services/`, `packages/services` não ganha camadas FSD.

## Trade-offs reconhecidos

- **Tradução de caminhos.** A doutrina fala em `src/`; o código mora em `packages/<pkg>/src/`. A tabela acima é a única ponte e precisa mudar junto com o layout.
- **Configuração por pacote.** Cada pacote tem `package.json`, `tsconfig` e scripts. `packages/config` reduz a repetição, não a elimina.
- **Versão única é restrição.** Um conflito de peer num pacote bloqueia o workspace inteiro; a saída é linha de exceção no ADR 0004 ou não adotar o pacote.
- **Granularidade de pacotes.** Dividir mais que os seis pacotes do core aumenta o grafo sem ganho; a divisão por contexto acontece dentro de `packages/services`, não em pacotes novos.

## Referências cruzadas

- Decisão: `@.contexts/engineering/decisions/0006-monorepo-layout-and-package-boundaries.md`.
- Pins e invariantes: `@.contexts/engineering/MEMORY.md`, `@.contexts/engineering/stacks/VERSIONS.md`.
- Estrutura interna: `@.contexts/engineering/architecture/fsd.md`, `@.contexts/engineering/architecture/feature-based.md`, `@.contexts/engineering/architecture/atomic-design.md`, `@.contexts/engineering/contracts/schemas.md` (§2).
- Fluxo de branches e CI seletivo: `@.contexts/engineering/processes/git.md` (§20).

## Aspectos intencionalmente omitidos

- Estrutura interna de `packages/agents` e o contrato de `defineModule()`: `contracts/agents.md`, a ser criado em SP0a Task 7.
- Detalhes de build do Tauri e do servidor Mastra: nos stacks e ADRs de desktop e topologia de runtime.
