# 0009. Topologia de runtime: `/v1` no Next (App Hosting), Functions para eventos, Mastra no Cloud Run

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** projeto DDC / spec do core agêntico (`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`, D5, D8, D10)
- **Tags:** `engineering`, `runtime`, `topology`, `app-hosting`, `cloud-run`, `functions`, `mastra`
- **Complements:** [0006](0006-monorepo-layout-and-package-boundaries.md) (`apps/web`, `apps/mastra` e `apps/functions` são os alvos de deploy), [0007](0007-desktop-and-mobile-shell-with-tauri-2.md) (o desktop só fala com o `/v1`), [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md) (quem acessa cada store) e [0004](0004-latest-stable-baseline-and-documented-exceptions.md) (acrescenta a exceção E6: runtime do App Hosting).

## Context

A 0006 fixou quatro apps: `apps/web` (Next 16), `apps/desktop` (Tauri 2), `apps/mastra` (servidor Mastra) e `apps/functions` (Functions Gen 2, `nodejs24`, E1). Falta decidir onde cada um roda e qual deles expõe a API.

Restrições:

- Web e desktop consomem a mesma API. O desktop não tem Server Components nem Server Actions (0007).
- Toda mutação passa pela API; o cliente não escreve no Firestore (D8).
- `rules/api-design.md` pede uma superfície pública versionada no path (`/v1`), com auth → validate → authorize → act, rate limit e envelope de erro único.

Fatos medidos em 2026-09-29:

- **Mastra.** `mastra build` gera `.mastra/output/`, autocontido, executado com `node .mastra/output/index.mjs`. `PORT` default `4111`. O servidor trata `SIGINT` e `SIGTERM`: para de aceitar conexões, espera até `server.drainTimeout` (default 5 s) e chama `mastra.shutdown()`. Expõe `GET /health` (`mastra.ai/docs/deployment/mastra-server`).
- **Scheduler do Mastra.** O scheduler embutido faz polling do storage atrás de schedules vencidos e exige processo long-lived. Para plataformas serverless (Vercel, Netlify, Lambda, Cloudflare Workers) a doc manda usar `@mastra/inngest` (`mastra.ai/docs/workflows/scheduled-workflows`).
- **Deploy do Mastra.** A doc de deployment lista servidor próprio, Docker/VM/PaaS e 14 provedores. Cloud Run e Firebase **não aparecem**. Rodar a saída do `mastra build` numa imagem Docker no Cloud Run é inferência a partir do contrato de container do Cloud Run, não caminho documentado pelo Mastra.
- **Cloud Run.** O container escuta em `0.0.0.0:$PORT` (default 8080). No shutdown recebe `SIGTERM` e tem 10 s antes do `SIGKILL`. Com billing por request (default), a CPU só existe durante o request. Com billing por instância (`--no-cpu-throttling`), a CPU fica alocada o tempo todo, o que a doc recomenda para trabalho em background (`docs.cloud.google.com/run/docs/container-contract`, `.../configuring/billing-settings`).
- **App Hosting.** Roda Next.js via `@apphosting/adapter-nextjs`. A tabela de suporte de Next.js da doc (atualizada em 2026-09-24) vai até **15.2.x**; Next 16 **não está listado**. Os runtimes citados são `nodejs20`, `nodejs22` e `nodejs24`, "espelhando o suporte do Cloud Run", e a página de runtimes do Cloud Run lista `nodejs26` só como **Preview** (`firebase.google.com/docs/app-hosting/frameworks-tooling`, `docs.cloud.google.com/run/docs/runtime-support`).

## Decision Drivers

- **Uma API pública só**, consumida por web e desktop, com o pipeline de `rules/api-design.md` num lugar.
- **Processo long-lived para o Mastra**: scheduler, streams longos de chat e workflows suspensos.
- **Reuso da doutrina existente**: Route Handlers do Next, Functions Gen 2 e Cloud Run já têm stack e processo documentados.
- **Paridade local**: `next dev`, `mastra dev` e o Emulator Suite reproduzem a topologia (D10).
- **Custo e cold start**: nada long-lived que não precise ser.
- **Superfície de ataque mínima**: só o que precisa ser público é público.

## Considered Options

A) **`/v1` em Route Handlers do `apps/web`, no Firebase App Hosting.** Functions só para triggers, jobs e webhooks. Mastra no Cloud Run, chamado só pelo servidor.

B) **`/v1` em Functions HTTP** (`onRequest` com roteador). `apps/web` só renderiza UI. Mastra no Cloud Run.

C) **Mastra como único backend.** Rotas de negócio registradas no servidor Hono do Mastra, no Cloud Run; o Next só renderiza UI.

## Pros and Cons of the Options

**A) `/v1` no Next**
- \+ O mesmo processo serve `(app)/`, `admin/`, Server Actions do web e `/v1`; o Route Handler só re-exporta o driving adapter de `packages/services` (`architecture/monorepo.md`).
- \+ Um deploy para UI e API web: mudança de contrato e de tela sai junta.
- \+ Rollback instantâneo por build no App Hosting.
- − O `/v1` escala junto com o render da UI.
- − O App Hosting não oferece Node 26 GA nem lista Next 16 na tabela de suporte: exceção de runtime (E6) e spike (spec §14 item 1).

**B) `/v1` em Functions**
- \+ API escala separada da UI.
- − Functions ficam em `nodejs24` (E1) e cada function é um deploy: um roteador REST inteiro numa function vira monólito com cold start, ou dezenas de functions com a mesma política duplicada.
- − Duas superfícies HTTP no web (Server Actions no Next e REST em Functions) com autenticação e CORS em dois lugares.
- − Contraria a doutrina atual de `rules/api-design.md`, escrita para Route Handlers.

**C) Mastra como único backend**
- \+ Um servidor para agentes e API; nenhum salto de rede no chat.
- − Acopla contratos de negócio e ciclo de release ao framework de agentes: upgrade de minor do Mastra passa a ser upgrade da API inteira.
- − O Next continuaria precisando de backend para Server Actions e RSC; a API se dividiria de qualquer forma.
- − Viola a fronteira da 0006: `packages/agents` usa `services` por use cases, não é o host deles.

## Decision Outcome

**Opção A.**

| App | Host | Papel | Exposição |
|---|---|---|---|
| `apps/web` | **Firebase App Hosting** (runtime `nodejs24`, E6) | UI (`(app)/`, `admin/`), Server Actions do web e a API pública `/v1` em Route Handlers | Pública: domínio do app |
| `apps/mastra` | **Cloud Run**, imagem Docker `node:26-alpine` com a saída do `mastra build` | Agents, workflows, memória, RAG, scheduler de workflows | Privada: só o servidor do `apps/web` chama (IAM `roles/run.invoker`) |
| `apps/functions` | **Firebase Functions Gen 2** (`nodejs24`, E1) | Triggers (Firestore, Storage, Pub/Sub, Eventarc, identity blocking), jobs `onSchedule` da aplicação e webhooks de entrada (`onRequest` com HMAC) | Só webhooks são públicos |
| `apps/desktop` | Binário Tauri (0007) | Cliente do `/v1` | — |

Regras da topologia:

- **O `/v1` é a única API pública.** Web e desktop chamam `/v1`; nenhum cliente chama o Mastra nem uma Function HTTP diretamente. Functions do core não expõem `onCall` nem API REST; `onRequest` só para webhook de entrada (`rules/api-design.md` §13).
- **Chat e execução de agente** passam por um Route Handler do `/v1` que autentica, valida e autoriza (tenant, projeto, papel) e só então encaminha ao servidor Mastra, repassando o stream ao cliente. A chamada leva duas credenciais: o ID token Google do service account do App Hosting em `X-Serverless-Authorization` (Cloud Run IAM) e o ID token Firebase do usuário em `Authorization`, validado de novo pelo `@mastra/auth-firebase` com `authorizeUser` checando a membership (spec §7). A configuração do pacote fica com o ADR de tenancy (SP0a Task 5) e o spike do SP0b.
- **O servidor Mastra roda com billing por instância** (`--no-cpu-throttling`) e `min-instances >= 1` em `staging` e `prod`. Com billing por request, o polling do scheduler fica sem CPU entre requests e o schedule não dispara.
- **Um só serviço Mastra na v1**, com API e scheduler no mesmo processo. Separar workers (`mastra worker`) exige PubSub distribuído e ADR novo.
- **Durabilidade:** `@mastra/google-cloud-pubsub` fora de `local`; em `local`, o PubSub em processo do Mastra (spec §7).
- **Cron:** workflow agendado do Mastra usa o scheduler do Mastra; job da aplicação sem agente usa `onSchedule` das Functions. Nenhum job existe nos dois.
- **Região única** para App Hosting, Cloud Run, Functions, Firestore, Cloud SQL e Storage (`processes/environments.md` §13).
- **`traceId` único** entre web, `/v1`, Mastra e Functions pelo contexto OTel (`rules/observability.md`).
- **Studio do Mastra** só em `local` (`mastra dev`). Em `staging` e `prod` a leitura de traces, custos e evals é pelo `/admin` (spec §9 e §10).

Operação de cada host: `@.contexts/engineering/stacks/backend/cloud-run.md`, `@.contexts/engineering/stacks/backend/firebase-platform.md`, `@.contexts/engineering/stacks/backend/firebase-functions.md`. Ordem de deploy e rollback por componente: `@.contexts/engineering/processes/deploy.md` §21.

Por que não B: espalha a API em functions `nodejs24` e divide autenticação e CORS entre dois hosts. Por que não C: amarra o contrato de negócio ao ciclo de release do framework de agentes e quebra a fronteira da 0006.

**Fallback do host web.** Se o spike do SP0b (spec §14 item 1) mostrar que o App Hosting não roda Next 16.3 de forma confiável, o `apps/web` passa a imagem Docker própria no Cloud Run (`output: 'standalone'`, `node:26-alpine`), com o mesmo papel. A troca é ADR novo que supersede a linha do `apps/web` desta tabela e remove a E6.

**Versões:** App Hosting não oferece Node 26 GA; o `apps/web` roda `nodejs24` nele. Isso entra como **E6** na tabela de exceções da 0004, na mesma política da E1. O Cloud Run roda imagem própria, então o Mastra fica em Node 26 como o baseline.

## Consequences

**Melhora:**
- Web e desktop têm uma superfície de API, com um pipeline de auth, validação, rate limit e erro.
- O Mastra fica fora da internet pública: só o servidor do web o alcança, com IAM e token do usuário.
- O scheduler de workflows tem um host onde roda de fato.
- Functions voltam ao papel em que são boas: reagir a evento e receber webhook.

**Piora:**
- Um salto de rede a mais no chat (`/v1` → Mastra). O Route Handler precisa repassar o stream sem bufferizar (`rules/api-design.md` §11) e propagar `AbortSignal` quando o cliente desconecta.
- Custo fixo do Mastra: billing por instância com `min-instances >= 1` cobra mesmo sem tráfego.
- Duas divergências de runtime no workspace: Functions (E1) e `apps/web` no App Hosting (E6) em Node 24; o resto em Node 26. Código de `packages/client`, `packages/services` e `packages/contracts` que o web usa não pode depender de API só da 26.
- O App Hosting não documenta traffic split: canary do web fica restrito a feature flag (`processes/deploy.md` §6).
- Três hosts para observar, cada um com seu log e métricas RED.

**Pontos em aberto (spikes do SP0b):**
- Next 16.3 no App Hosting e no emulator do App Hosting (spec §14 item 1). Fallback local: `next dev`.
- Várias instâncias do Mastra rodando o scheduler ao mesmo tempo: confirmar que o `@mastra/pg` impede disparo duplicado do mesmo tick.
- Stream longo do chat através do Route Handler no App Hosting (timeout de request do backend).
- Como o App Hosting alcança o Cloud Run com IAM (service account do backend, audiência do ID token).

**Arquivos que passam a mudar:**
- Novos `stacks/backend/cloud-run.md` e `stacks/backend/firebase-platform.md`.
- `processes/deploy.md` ganha a seção de componentes e a ordem de deploy (§21).
- `decisions/0004-...` ganha a linha E6; `MEMORY.md` (linha Runtime, invariantes 1 e 6) e `stacks/VERSIONS.md` passam a citar E6; `architecture/monorepo.md` (faixa de `engines.node` do `apps/web`) e `processes/environments.md` §2 (divergência de runtime aceita).
- `stacks/ai/mastra-sdk.md`: deploy Docker/Cloud Run no lugar do deployer Vercel (SP0a Task 7).
- Menções a Vercel como host em `processes/environments.md` (§3.3, §4, §10, §14), `contracts/secrets.md` §2 e `processes/deploy.md` (§2, §9, §12, §15) passam a "não usado no core v1". O `deploy.md` já registra isso na §21; os outros dois ficam para a SP0a Task 9 ou 10.

## References

- `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §2 (D5, D8, D10), §3, §7, §11, §14 item 1
- `@.contexts/engineering/rules/api-design.md`, `@.contexts/engineering/rules/observability.md`, `@.contexts/engineering/architecture/monorepo.md`
- [0004](0004-latest-stable-baseline-and-documented-exceptions.md), [0006](0006-monorepo-layout-and-package-boundaries.md), [0007](0007-desktop-and-mobile-shell-with-tauri-2.md), [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md)
- https://mastra.ai/docs/deployment/mastra-server · https://mastra.ai/docs/deployment/overview · https://mastra.ai/docs/workflows/scheduled-workflows · https://mastra.ai/docs/deployment/workers
- https://docs.cloud.google.com/run/docs/container-contract · https://docs.cloud.google.com/run/docs/configuring/billing-settings · https://docs.cloud.google.com/run/docs/runtime-support · https://docs.cloud.google.com/run/docs/authenticating/service-to-service
- https://firebase.google.com/docs/app-hosting/frameworks-tooling · https://firebase.google.com/docs/app-hosting/rollouts
