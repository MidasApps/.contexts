# 0006. Monorepo pnpm + Turborepo e mapeamento da doutrina `src/` para pacotes

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** projeto DDC / spec do core agêntico (`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`, D1, D2, D6)
- **Tags:** `engineering`, `architecture`, `monorepo`, `boundaries`
- **Complements:** [0003](0003-cross-doc-convention-conflicts-resolved.md) (os caminhos vencedores continuam valendo dentro de cada pacote) e [0004](0004-latest-stable-baseline-and-documented-exceptions.md) (pnpm 12.6.0 e turbo 2.11.5 entram pelo baseline; o pacote de functions segue a E1).

## Context

A doutrina de engenharia descreve um único `src/`: frontend FSD em `src/{views,widgets,features,entities,shared}`, UI compartilhada Atomic em `src/shared/ui/`, backend por contexto em `src/services/<context>/`, schemas client ↔ server em `src/contracts/<context>/` e roteamento do Next em `src/app/`. `processes/git.md` §20 deixava o layout "a definir pelo projeto".

Este repositório passa a ser a base de um core agêntico genérico, sem domínio de negócio, do qual outras aplicações nascem de dois jeitos: clonando o repositório inteiro (código + harness) ou clonando só o harness (`.contexts/` + `.claude/`). A v1 tem quatro superfícies executáveis com runtimes diferentes: web (Next 16), desktop/mobile (Tauri 2 + Vite), servidor Mastra long-lived e Firebase Functions Gen 2 em `nodejs24` (E1). Web e desktop precisam da mesma camada FSD. Aplicações derivadas estendem o core por módulos (`defineModule()`), e o core nunca importa um módulo específico.

Um `src/` único não expressa quatro alvos de build com runtimes distintos, e as fronteiras entre frontend, backend e agentes hoje só existem por convenção de pasta.

## Decision Drivers

- **Dois modos de reuso.** Clonar tudo precisa trazer código e doutrina coerentes; clonar só o harness precisa trazer doutrina que não dependa do código deste repositório.
- **Web + Tauri compartilhando FSD.** A mesma área do usuário roda nos dois apps sem cópia de `views`, `widgets`, `features`, `entities` e `shared`.
- **Doutrina e código evoluem juntos.** Um PR que muda uma convenção muda o código que a aplica no mesmo commit, sem ciclo de publicação entre repositórios.
- **Runtimes distintos.** Functions ficam em Node 24 (E1); o resto em Node 26. Cada alvo precisa de `engines`, build e deploy próprios.
- **Fronteiras verificáveis.** `client` não pode alcançar `services` nem `agents`; a regra precisa de enforcement mecânico, não só de revisão.
- **Extensão por módulo.** Módulos entram sem que o core os importe (D6).
- **Custo de CI.** Rodar só o que a mudança afeta.

## Considered Options

1. **`src/` único (doutrina atual).** Um app Next com tudo dentro; Tauri, Mastra e Functions como pastas extras com build próprio.
2. **Monorepo pnpm workspaces + Turborepo**, com `apps/` (só composição), `packages/` (o `src/` da doutrina distribuído) e `modules/`, e `.contexts/` + `.claude/` na raiz.
3. **Core publicado como pacotes npm** em repositório próprio, consumidos por cada aplicação derivada.

## Decision Outcome

**Opção 2.** O repositório vira monorepo pnpm 12.6.0 + turbo 2.11.5:

- `apps/{web,desktop,mastra,functions}` só compõem: roteamento, plugins nativos, entry points e deploy.
- `packages/{client,contracts,services,agents,i18n,config}` recebem o `src/` da doutrina sem mudar a estrutura interna. `packages/client` é o FSD (com `shared/ui` Atomic), `packages/services` o backend hexagonal por contexto, `packages/contracts` os schemas.
- `modules/` fica vazio no core; `modules/example` existe só para provar o contrato de módulo.
- Fronteiras de import enforced por `eslint-plugin-boundaries` 7.2.0 (roda no ESLint 9.39.5, E3) e pela declaração explícita de dependências `workspace:*`.

O mapeamento path a path, as fronteiras e os pipelines ficam em `@.contexts/engineering/architecture/monorepo.md`. As árvores internas continuam em `architecture/fsd.md`, `architecture/feature-based.md`, `architecture/atomic-design.md` e `contracts/schemas.md` §2.

Por que não a 1: não separa os alvos de runtime (Node 24 × Node 26, Next × Vite), obriga o desktop a importar de dentro do app web e deixa as fronteiras só na convenção de pasta. Por que não a 3: quebra "doutrina e código evoluem juntos" (cada mudança de convenção vira release + bump em N repositórios), e o modo "clonar tudo" perde o código-fonte do core no mesmo histórico. O modo "clonar só o harness" funciona igual nas opções 2 e 3, então não desempata a favor da 3.

## Consequences

**Melhora:**
- Web e desktop consomem o mesmo `packages/client`; o `/admin` fica só no `apps/web`.
- Cada app declara o próprio `engines.node` (`>=26.0.0 <27`; `apps/functions` `>=24.0.0 <25`, invariante 6 da `MEMORY.md`).
- Violação de fronteira quebra o lint, não depende de review.
- `turbo run <task> --affected` limita o CI ao que mudou.

**Piora:**
- Mais arquivos de configuração (`pnpm-workspace.yaml`, `turbo.json`, `package.json` e `tsconfig` por pacote).
- Os caminhos citados na doutrina (`src/...`) passam a exigir tradução para o pacote; a tabela de mapeamento em `architecture/monorepo.md` é obrigatória e precisa acompanhar mudanças de layout.
- Uma única versão de cada dependência compartilhada no workspace (invariante 8 da `MEMORY.md`) vira restrição ativa: conflito de peer entre pacotes bloqueia a instalação em vez de ficar isolado.

**Arquivos que passam a mudar:**
- Novo `architecture/monorepo.md`.
- `processes/git.md` §20 troca "a definir" pelo link para `architecture/monorepo.md`.
- Nota curta de mapeamento em `architecture/fsd.md`, `architecture/feature-based.md`, `architecture/atomic-design.md` e `contracts/schemas.md` §2, sem mudar as regras internas.
- `MEMORY.md` (Architecture: 7 modelos) e o índice de `decisions/README.md`.
- O contrato de `defineModule()` fica em `contracts/agents.md`, a ser criado em SP0a Task 7.

## References

- `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §2 (D1, D2, D6) e §3
- `@.contexts/engineering/architecture/monorepo.md`
- `@.contexts/engineering/processes/git.md` §20
- `@.contexts/engineering/stacks/VERSIONS.md` (pnpm, turbo, `eslint-plugin-boundaries`)
- [0003](0003-cross-doc-convention-conflicts-resolved.md), [0004](0004-latest-stable-baseline-and-documented-exceptions.md)
- https://pnpm.io/workspaces · https://turborepo.com/docs · https://github.com/javierbrea/eslint-plugin-boundaries
