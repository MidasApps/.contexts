---
title: Cloud Run
type: stacks
category: backend
version: "serviço gerenciado (sem versão); imagem node:26-alpine; mastra@1.31.3 / @mastra/core@1.71.0"
last_updated: 2026-09-29
status: current
upstream:
  - https://docs.cloud.google.com/run/docs
  - https://mastra.ai/docs/deployment/mastra-server
---

# Cloud Run

Host do servidor Mastra (`apps/mastra`) do core, segundo a topologia da `@.contexts/engineering/decisions/0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md`. Este documento cobre só o que o Cloud Run exige desse serviço: imagem, porta, shutdown, billing, escala, rede até o Cloud SQL e secrets. Doutrina de secrets, ambientes e observabilidade não se repete aqui: `@.contexts/engineering/contracts/secrets.md`, `@.contexts/engineering/processes/environments.md`, `@.contexts/engineering/rules/observability.md`.

Firebase Functions Gen 2 também rodam sobre Cloud Run, mas são configuradas pelo SDK de Functions: `@.contexts/engineering/stacks/backend/firebase-functions.md`. Nada deste documento se aplica a elas.

> **Grau de confirmação.** A doc do Mastra não lista Cloud Run entre os alvos de deploy (medido em 2026-09-29). Rodar a saída do `mastra build` numa imagem Docker no Cloud Run é inferência: o servidor gerado é um processo Node comum e o Cloud Run aceita qualquer container que cumpra o contrato abaixo. O spike do SP0b confirma.

## Versões

- Cloud Run é serviço gerenciado, sem versão a pinar.
- Imagem base: `node:26-alpine` (baseline de `@.contexts/engineering/MEMORY.md`). A imagem é nossa, então o Mastra não depende da lista de runtimes do Cloud Run (lá o `nodejs26` ainda é Preview).
- `@mastra/core` 1.71.0 e CLI `mastra` 1.31.3, na mesma leva (`@.contexts/engineering/stacks/ai/mastra-sdk.md`).
- `@google-cloud/cloud-sql-connector` 1.12.0, se o connector Node for usado (ver "Rede até o Cloud SQL").

## Contrato do container

| Item | Cloud Run | Servidor Mastra | O que fazer |
|---|---|---|---|
| Porta | injeta `PORT` (default 8080) | lê `PORT` (default 4111 fora do Cloud Run) | nada: o `PORT` injetado vence |
| Interface | exige `0.0.0.0` | `server.host` default `localhost` | **`MASTRA_HOST=0.0.0.0`** na imagem |
| Shutdown | `SIGTERM`, 10 s até o `SIGKILL` | trata `SIGTERM`, drena até `server.drainTimeout` (default 5 s) e chama `mastra.shutdown()` | manter `drainTimeout` < 10 s |
| Timeout de request | `--timeout` do serviço (máx. 60 min) | `server.timeout` default 180 s | alinhar os dois ao stream mais longo aceito |
| Health | startup/liveness probe HTTP | `GET /health` → 200 | apontar os probes para `/health` |
| Filesystem | em memória, some no shutdown | — | nada de arquivo local como estado |
| Variáveis | `K_SERVICE`, `K_REVISION`, `K_CONFIGURATION` | — | logar `K_REVISION` como versão do deploy |

`/health` do Mastra é liveness: diz que o processo responde, não que o Postgres está acessível. A readiness com dependências de `processes/deploy.md` §8 é rota própria do core, definida no SP0b.

## Imagem

`mastra build` gera `.mastra/output/`, que a doc do Mastra descreve como autocontido (`node .mastra/output/index.mjs`). Build multi-stage a partir da raiz do monorepo:

```dockerfile
# apps/mastra/Dockerfile — contexto de build: raiz do repositório
FROM node:26-alpine AS build
WORKDIR /repo
# Node 25+ não distribui corepack: instalar o pnpm do packageManager explicitamente
RUN npm install -g pnpm@12.6.0
COPY . .
RUN pnpm install --frozen-lockfile --filter ./apps/mastra...
RUN pnpm --filter ./apps/mastra exec mastra build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production MASTRA_HOST=0.0.0.0
COPY --from=build /repo/apps/mastra/.mastra/output ./
USER node
CMD ["node", "index.mjs"]
```

- O `--filter ./apps/mastra...` instala o app e os pacotes do workspace de que ele depende (`@core/agents`, `@core/services`, `@core/contracts`).
- Não copie `.env*` para a imagem; `.dockerignore` exclui `.env*`, `node_modules` e `.mastra/` locais.
- Confirmar no spike se `.mastra/output` já traz `node_modules` com dependências nativas resolvidas para Alpine (musl). Se não trouxer, rodar a instalação de produção no estágio final.
- A imagem vai para o Artifact Registry do projeto GCP do ambiente, com tag igual ao `GIT_SHA` (`processes/deploy.md` §7).

## Configuração do serviço

```bash
gcloud run deploy mastra \
  --image="$REGION-docker.pkg.dev/$PROJECT/core/mastra:$GIT_SHA" \
  --region="$REGION" \
  --service-account="mastra-runtime@$PROJECT.iam.gserviceaccount.com" \
  --no-allow-unauthenticated \
  --no-cpu-throttling \
  --min-instances=1 --max-instances=10 \
  --concurrency=40 --timeout=900 \
  --set-env-vars="APP_ENV=$APP_ENV" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
  --add-cloudsql-instances="$PROJECT:$REGION:core-pg"
```

Os números são ponto de partida para o spike, não baseline.

- **`--no-cpu-throttling` (billing por instância) é obrigatório.** O scheduler do Mastra faz polling do storage. Com o billing por request (default), a CPU só existe durante requests e o schedule não dispara.
- **`--min-instances=1`** em `staging` e `prod`: mantém o scheduler vivo e tira o cold start do chat. Em `dev` pode ser 0 se o ambiente não depender de workflow agendado.
- **`--max-instances` sempre definido.** É o teto de custo e também o teto de conexões ao Postgres.
- **`--concurrency`.** O default via `gcloud` é 80 × vCPU (máx. 1000). Stream de chat segura a conexão enquanto o modelo responde: comece baixo e meça.
- **`--timeout`** acima do stream mais longo aceito e igual a `server.timeout` do Mastra, que corta em 180 s por default.
- **`--no-allow-unauthenticated`.** Só o service account do backend do App Hosting recebe `roles/run.invoker` no serviço (0009).
- **Região** igual à do Firestore, Cloud SQL e App Hosting (`processes/environments.md` §13).

## Chamada a partir do `/v1`

O Route Handler do `apps/web` chama o Mastra com duas credenciais (0009):

| Header | Conteúdo | Quem valida |
|---|---|---|
| `X-Serverless-Authorization: Bearer <ID token Google>` | token do service account do App Hosting, audiência = URL do serviço | Cloud Run IAM. Quando o header existe, só ele é checado, e a assinatura é removida antes de chegar ao container |
| `Authorization: Bearer <ID token Firebase>` | token do usuário, repassado sem alteração | `@mastra/auth-firebase` + `authorizeUser` (ADR de tenancy, SP0a Task 5) |
| `traceparent` | contexto OTel | `@mastra/observability` (`rules/observability.md`) |

CORS: nenhum browser chama o Mastra. Configure `server.cors: false` (o default é `origin: '*'`).

## Rede até o Cloud SQL

| Caminho | Como | Quando |
|---|---|---|
| Conexão Cloud SQL embutida | `--add-cloudsql-instances`; socket em `/cloudsql/<INSTANCE_CONNECTION_NAME>/.s.PGSQL.5432` | default do core: sem VPC para operar |
| IP privado | Direct VPC egress (ou connector Serverless VPC Access) e TCP na 5432 | quando a instância não tem IP público (`processes/environments.md` §12) |
| Connector Node | `@google-cloud/cloud-sql-connector`: TLS e IAM database auth sem proxy | quando se quer IAM auth no lugar de senha |

- O caminho do socket tem limite de 108 caracteres no Linux; nome de instância longo quebra a conexão.
- **Cada instância do Cloud Run tem limite de 100 conexões ao Cloud SQL.** O pool do `PostgresStore` e do `PgVector` fica abaixo disso, e `max-instances × pool` cabe no `max_connections` da instância com folga para migrations e Functions (`stacks/database/postgres.md`, "Connection pooling").
- TLS e role de menor privilégio por schema (`mastra`, `ai`) conforme a 0008 e `rules/security.md`.

## Secrets e configuração

- Secrets vêm do Secret Manager por `--set-secrets=ENV_VAR=SECRET_NAME:version` e chegam ao processo como env var. Naming e separação por ambiente: `@.contexts/engineering/contracts/secrets.md` §3 e §6.
- `apps/mastra/src/env.ts` valida todas as env vars com Zod no boot e falha rápido (`contracts/secrets.md` §5.4). O resto do código importa `env` de lá.
- Fixe a versão do secret em `prod` (`:3`, não `:latest`) quando a rotação precisar de deploy coordenado; rotação não reinicia instâncias sozinha.
- Nada de `.env` na imagem. `MASTRA_SKIP_DOTENV=true` em produção evita leitura acidental de `.env`.

## Observabilidade

- Logs em JSON no stdout vão para o Cloud Logging sem agente. Campos e níveis: `rules/observability.md`. Incluir `service: "mastra"`, `env` e `K_REVISION`.
- Traces: `@mastra/observability` com exporter OTLP para o Cloud Trace (spec §10). Spans `gen_ai.*` e `SensitiveDataFilter` ligado.
- Métricas RED do serviço vêm do Cloud Run (request count, latência, 5xx). Custo e tokens por tenant são métrica de negócio emitida pelo código.

## Deploy e rollback

- Cada deploy cria uma revisão imutável. Rollout gradual: `--no-traffic` no deploy e depois `gcloud run services update-traffic mastra --to-revisions=<rev>=10`.
- Rollback: `gcloud run services update-traffic mastra --to-revisions=<rev-anterior>=100`.
- Ordem entre componentes e janela de observação: `@.contexts/engineering/processes/deploy.md` §21.
- Revisão nova e antiga convivem durante o rollout e compartilham o mesmo schema `mastra`: upgrade de minor do Mastra que migra tabelas precisa de rollout sem tráfego dividido (spike do SP0b).

## Desenvolvimento local

`local` não usa Cloud Run. `mastra dev` sobe o servidor e o Studio na 4111 contra o Postgres do Docker (`processes/environments.md` §9). Para testar a imagem: `docker build -f apps/mastra/Dockerfile .` e `docker run -e PORT=8080 -e MASTRA_HOST=0.0.0.0 -p 8080:8080 ...`, com `DATABASE_URL` apontando para o Postgres local.

## Anti-patterns

- Billing por request no serviço Mastra: o scheduler para em silêncio.
- `MASTRA_HOST` ausente: o servidor escuta em `localhost` e a revisão nunca fica saudável.
- `--allow-unauthenticated` no Mastra: cria uma segunda API pública fora do `/v1`.
- `server.timeout` default com chat longo: stream cortado em 180 s.
- `max-instances` sem cálculo de conexões: estoura o `max_connections` do Cloud SQL em pico.
- Service account default do Compute Engine: use um service account por serviço, com o mínimo de papéis.
- Estado em arquivo local ou em memória entre requests: a instância pode sumir a qualquer momento.
- `corepack enable` na imagem `node:26`: o corepack não vem mais com o Node 25+.

## Referências

- https://docs.cloud.google.com/run/docs/container-contract
- https://docs.cloud.google.com/run/docs/configuring/billing-settings
- https://docs.cloud.google.com/run/docs/about-concurrency
- https://docs.cloud.google.com/run/docs/authenticating/service-to-service
- https://docs.cloud.google.com/sql/docs/postgres/connect-run
- https://mastra.ai/docs/deployment/mastra-server · https://mastra.ai/reference/configuration · https://mastra.ai/docs/workflows/scheduled-workflows
- `@.contexts/engineering/stacks/ai/mastra-sdk.md`, `@.contexts/engineering/stacks/database/postgres.md`, `@.contexts/engineering/stacks/runtime/node@26.md`
