# Prompt — Core agêntico de aplicação

> Prompt inicial one-shot. Cole como primeira mensagem de uma sessão Claude Code na
> raiz deste repositório. A doutrina vive em `.contexts/` (SSOT) e prevalece sobre
> este texto em caso de conflito.

---

## Objetivo

Estruture, neste repositório, um **core agêntico de aplicação** (harness de app)
genérico, base para qualquer aplicação agêntica futura. Ele deve poder ser reusado
de dois jeitos:

- **clonando o repositório inteiro** (harness DDC + core) para iniciar uma nova aplicação;
- **clonando só o harness de desenvolvimento** (`.contexts/` + `.claude/`).

O core é plataforma, sem domínio de negócio. Domínios entram depois como módulos
plugáveis.

## Como trabalhar

- Siga o DDC: `using-ddc` → `writing-plans-ddc` → execução com TDD →
  `verification-before-completion`, registrando no ledger `.claude/agent-memory/progress.md`.
- Respeite integralmente `.contexts/engineering/` (rules, contracts, architecture,
  stacks, processes, ADRs e pins de `MEMORY.md`). Não repita doutrina no código nem
  em `.claude/`.
- Divida em subprojetos com spec, plano e verificação próprios (ordem sugerida abaixo).
- Antes de implementar a camada de IA, **vasculhe https://mastra.ai/docs/** e use
  tudo o que for aplicável ao core.
- **Diga quais contextos de engenharia precisam ser criados, atualizados ou
  removidos** e crie-os (via `ddc-engineering` / `decisions`) antes do código que
  depende deles.

## Escopo funcional

1. **Agentes e skills**: multi-agente (supervisor + subagentes), skills, tools.
2. **Memória**: curta (thread), longa (working/semantic/observational) e
   **knowledge base vetorial** (RAG).
3. **Usuários, perfis e permissões**: RBAC, perfis e área do usuário.
4. **Workflows**: incluindo human-in-the-loop (suspend/resume) e agendados.
5. **Conectores / integrações**: bancos de dados, APIs e MCPs (cliente e servidor).
6. **Tools para a IA**: Firecrawl, browser e demais tools úteis.
7. **Evals**: scorers, datasets, experiments, gates no CI.
8. **Logs e observabilidade**: logs estruturados, tracing, custos de tokens.
9. **Chat conversacional**: multi-agente, streaming, componentes interativos
   (generative UI), aprovação de ações, histórico de conversas, upload de documentos
   (arquivos, imagens e vídeos) e chat por voz.
10. **Multi-tenant, internacionalização, multi-currency e fuso horário.**
11. **Duas superfícies**: `/admin` (administração da plataforma) e a área do usuário
    que usa o produto.
12. **App shell**: menu lateral, seleção de clientes (organizações) e projetos, área
    de perfil do usuário com suas configurações.
13. Qualquer outra funcionalidade do Mastra útil a um core agêntico.

## Stack e arquitetura

- **Arquitetura**: FSD no frontend + Atomic Design na biblioteca de UI; hexagonal /
  feature-based no backend (conforme `.contexts/engineering/architecture/`).
- **Plataformas**: web, desktop e mobile.
- **Firebase**: todas as stacks aplicáveis (Auth, Firestore, Functions, Storage,
  App Hosting, App Check, Remote Config, FCM, BigQuery).
- **IA**: Mastra (framework + `@mastra/client-js`) sobre Vercel AI SDK.
- **UI**: shadcn/ui + Tailwind CSS + **Vercel AI Elements** no chat. Use a CLI do
  shadcn (instale se não houver), com referência em
  https://ui.shadcn.com/docs/components e https://ui.shadcn.com/blocks.
  Tokens visuais de `.design-system/`.

## Decisões já tomadas (registrar em ADR)

1. **Monorepo neste repositório** (pnpm + Turborepo): `.contexts/` e `.claude/` na raiz,
   `apps/` (web, desktop, mastra, functions), `packages/` (client FSD compartilhado,
   contracts, services, agents, ui/i18n/config), `modules/` para domínios futuros.
2. **Web (Next.js) + desktop/mobile com Tauri 2 desde a v1**, compartilhando a
   mesma camada FSD. `/admin` só no web.
3. **Dados**: Firestore para dados da aplicação e realtime; Postgres + pgvector para
   o Mastra (memória, workflows, evals) e a knowledge base; Cloud Storage para
   uploads; BigQuery para analytics e custos. (Mastra não suporta Firestore como
   storage.)
4. **Tenancy**: Organização (tenant) → Projeto → árvore opcional de unidades definida
   por cada aplicação; papéis atribuídos por nó e herdados; usuário pode pertencer a
   várias organizações.
5. **Topologia**: API `/v1` em Route Handlers do Next (web e desktop consomem a
   mesma API); Firebase Functions para eventos, jobs e webhooks; servidor Mastra
   em host long-lived (Cloud Run).
6. **Extensão por módulo**: um contrato (`defineModule()`) pelo qual cada aplicação
   registra permissões, navegação, settings, traduções, agentes, tools, workflows e
   skills — o core nunca importa um módulo específico.
7. **Desenvolvimento local com Firebase Emulator Suite** + Postgres/pgvector em
   Docker, sem depender de nenhum ambiente remoto.

## Contratos de dados (ponto central)

Os contratos de dados — schemas de estado, banco, APIs, eventos, settings e tools —
devem ser **muito bem organizados e ter fonte única**, porque servem a dois fins:

- **modelar** o sistema (tipos, validação, OpenAPI, migrações);
- **dar conhecimento à IA** sobre a estrutura dos dados, para que ela saiba
  **renderizar formulários, montar consultas/SQL e enviar dados** com segurança.

Para isso, cada contrato carrega metadados legíveis por máquina (descrição,
exemplos, relações, sensibilidade/PII, escopo de tenant, dicas de UI) e gera um
**catálogo de dados** consumido pelos agentes (knowledge base, tools e MCP). Ações
da IA passam pelos mesmos schemas e pela mesma autorização da UI.

## Ordem sugerida de subprojetos

1. Fundação e doutrina: monorepo, ADRs, contextos novos, emuladores, CI.
2. Identidade, tenancy e RBAC.
3. App shell e UI (web + desktop), i18n, moeda e fuso.
4. Runtime agêntico (Mastra): agentes, memória, knowledge base, conectores, tools, guardrails, observabilidade, evals.
5. Chat completo.
6. Workflows e console `/admin`.

## Entrega esperada

- Core funcional rodando localmente de ponta a ponta: login, troca de organização e
  projeto, chat multi-agente com as capacidades acima, workflow com aprovação e o `/admin`.
- Contextos de engenharia e ADRs atualizados.
- README explicando como iniciar uma nova aplicação a partir do core e como criar um módulo.
