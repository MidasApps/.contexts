# DataViz

Dashboard Next.js para carteiras de crédito (securitização imobiliária). A aplicação é **data-driven**: cada relatório carrega blocos do Firestore, resolve `metric.recipe` → contrato de dados → binding do cliente → dataset BigQuery, e executa a consulta no projeto GCP configurado.

Não há credenciais de terceiros neste repositório. Tudo aponta para **o seu** projeto GCP.

## Requisitos

| Ferramenta | Versão |
|---|---|
| Node.js | 24 LTS |
| pnpm | 10.32.1 (já pinado em `package.json`) |
| gcloud CLI | atual, autenticado |
| Conta GCP | com billing habilitado |

Opcional: [Firebase CLI](https://firebase.google.com/docs/cli) se for usar emuladores.

```bash
node -v    # v24.x
corepack enable
corepack prepare pnpm@10.32.1 --activate
gcloud version
```

## 1. Instalar o app

```bash
git clone https://github.com/MidasApps/dataviz.git
cd dataviz
git checkout develop
pnpm install
cp .env.example .env.local
```

Edite `.env.local` **depois** de criar o projeto GCP (passo 2). Nunca commite `.env.local`, chaves JSON nem dumps de cliente.

Comandos do dia a dia:

```bash
pnpm dev                 # http://localhost:3005 (porta fixa no script)
pnpm test                # Vitest
pnpm exec tsc --noEmit   # typecheck (o build do Next não cobre testes)
pnpm lint
pnpm build
```

Em `NODE_ENV=development`, se não houver `FIREBASE_ADMIN_PRIVATE_KEY`, o login é dispensado (bypass). Dá para abrir `/dashboard` direto depois que o Firestore tiver pelo menos um cliente.

## 2. Projeto GCP de teste

Substitua `SEU_PROJECT` pelo id do projeto (kebab-case, único no GCP).

```bash
gcloud projects create SEU_PROJECT --name="DataViz teste"
gcloud config set project SEU_PROJECT
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project SEU_PROJECT
```

Ative as APIs:

```bash
gcloud services enable \
  bigquery.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  identitytoolkit.googleapis.com \
  firebaserules.googleapis.com \
  aiplatform.googleapis.com \
  cloudresourcemanager.googleapis.com
```

Habilite o Firebase **no mesmo projeto GCP** (o Admin SDK usa um único
`projectId` para Auth e Firestore — um projeto Firebase separado não serve):

```bash
pnpm setup:firebase -- --project=SEU_PROJECT --write-env
```

O script anexa o Firebase ao projeto, usa o app Web chamado `dataviz-local`
(ou o de `--app-name=<nome>`), criando-o se não existir e parando se houver
mais de um com esse nome, liga o login por e-mail/senha e grava as
`NEXT_PUBLIC_FIREBASE_*` no `.env.local`. Se responder
**403 em `addFirebase`**, a conta ainda não aceitou os Termos do Firebase:
abra https://console.firebase.google.com uma vez, aceite, e rode de novo.
**Não** crie um projeto novo nessa tela. Google como provedor de login é
opcional e fica no console.

### Firestore (banco nomeado)

O app **não** usa o banco `(default)`. Ele lê `DATAVIZ_DATABASE_ID` (default `dataviz`).

```bash
# Região de exemplo; use a mesma em FIRESTORE e no .env
gcloud firestore databases create \
  --database=dataviz \
  --location=southamerica-east1 \
  --type=firestore-native

# Espelho opcional para desenvolvimento
gcloud firestore databases create \
  --database=dataviz-dev \
  --location=southamerica-east1 \
  --type=firestore-native
```

Publique as regras **e os índices compostos** no banco que o `.env.local` aponta:

```bash
node scripts/deploy-firestore-rules.mjs SEU_PROJECT dataviz firestore.rules
node scripts/deploy-firestore-indexes.mjs SEU_PROJECT dataviz
```

Sem os índices, a lista de conversas do assistente quebra com "The query
requires an index". A criação é assíncrona (alguns minutos); acompanhe com
`gcloud firestore indexes composite list --database=dataviz`.

As regras reconhecem admin só pelo custom claim `role: admin` (não por domínio de e-mail). O domínio `ADMIN_EMAIL_DOMAIN` vale para as APIs HTTP.

### IAM (sua conta de usuário, ambiente de teste)

```bash
gcloud projects add-iam-policy-binding SEU_PROJECT \
  --member="user:voce@empresa.com" \
  --role="roles/datastore.user"
gcloud projects add-iam-policy-binding SEU_PROJECT \
  --member="user:voce@empresa.com" \
  --role="roles/bigquery.jobUser"
gcloud projects add-iam-policy-binding SEU_PROJECT \
  --member="user:voce@empresa.com" \
  --role="roles/bigquery.dataEditor"
gcloud projects add-iam-policy-binding SEU_PROJECT \
  --member="user:voce@empresa.com" \
  --role="roles/firebaseauth.admin"
gcloud projects add-iam-policy-binding SEU_PROJECT \
  --member="user:voce@empresa.com" \
  --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding SEU_PROJECT \
  --member="user:voce@empresa.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

Em produção, use service account com least privilege — nunca a role `owner`. Não commite JSON de chave; no local prefira ADC (`gcloud auth application-default login`).

### `.firebaserc`

Troque o placeholder:

```json
{
  "projects": {
    "default": "SEU_PROJECT"
  }
}
```

## 3. `.env.local` mínimo

Copie de `.env.example`. Preencha pelo menos:

```bash
# GCP / BigQuery
BIGQUERY_PROJECT_ID=SEU_PROJECT
BIGQUERY_LOCATION=US
BIGQUERY_DATASET=dataviz
GOOGLE_CLOUD_PROJECT=SEU_PROJECT
GOOGLE_CLOUD_LOCATION=us-central1

# Vertex (assistente). Geração 3 do Gemini usa endpoint global.
GOOGLE_VERTEX_PROJECT=SEU_PROJECT
GOOGLE_VERTEX_LOCATION=global

# Firebase (valores do app Web no console)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=SEU_PROJECT.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=SEU_PROJECT
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=SEU_PROJECT.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firestore nomeado
DATAVIZ_DATABASE_ID=dataviz
NEXT_PUBLIC_DATAVIZ_DATABASE_ID=dataviz

# Admin HTTP: e-mails @este-domínio passam nas APIs de administração
ADMIN_EMAIL_DOMAIN=empresa.com
NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN=empresa.com

# Id do documento dataSources/ — TEM de ser o id do projeto GCP (ver §5.1)
DATA_SOURCE_ID=SEU_PROJECT
```

Para apontar o dev server ao espelho, use `.env.dev.example` (`dataviz-dev`) e reinicie o `pnpm dev` — as `NEXT_PUBLIC_*` entram no bundle na subida.

## 4. Base BigQuery de teste

Três datasets cobrem o caminho feliz: carteira de exemplo, metadados do assistente, e (opcional) BQML.

### 4.1 Carteira de exemplo

```bash
pnpm bq:bootstrap-sample -- --project=SEU_PROJECT --dry-run   # mostra o plano
pnpm bq:bootstrap-sample -- --project=SEU_PROJECT             # aplica
```

Cria, no formato que os seeds do Vila Rosa esperam:

- `vila_rosa_monitor` — `contratos`, `pagamentos`, `fluxo_caixa` carregados
  dos CSVs de amostra em `docs/` (10 linhas cada), **mais as colunas do
  contrato que a amostra não traz**, criadas nulas. Sem elas o SQL das
  métricas falha com "Unrecognized name".
- `vila_rosa_covenants` — 7 tabelas vazias com o schema do contrato.
- `dataviz_aux` — `ba_bancos` e `ba_pluggy_categorias` vazias, para os JOINs
  literais das métricas de extrato não quebrarem (ver 4.3 para as reais).

Idempotente: não recria o que existe, nunca apaga. Schemas de referência:
`docs/*_schema.csv` e `scripts/lib/vila-rosa-schemas.mjs` (fonte única).

Para ver as 13 páginas com dado de verdade (séries mensais, faixas de atraso,
obra, certidões, extrato), carregue a **carteira sintética** em vez da amostra:

```bash
pnpm bq:seed-synthetic -- --project=SEU_PROJECT --dry-run   # mostra as contagens
pnpm bq:seed-synthetic -- --project=SEU_PROJECT             # recria as 12 tabelas
```

Gera 3 empreendimentos, 120 contratos e 18 fotos mensais (jul/2024 a
dez/2025), determinística por `--seed`. O domínio padrão é
`--domain=vila-rosa`; `--domain=real-estate` é a carga do 4.1b. Ajustes:
`--months`, `--contracts` (por empreendimento), `--last-snapshot`,
`--location`. O `--dry-run` só gera e conta as linhas, sem tocar no BigQuery. Os textos seguem os literais que o
SQL das métricas compara. **Apaga e recria** as tabelas dos três datasets,
então nunca aponte para um dataset com dado real. Gerador em
`scripts/lib/synthetic-portfolio.ts`.

### 4.1b Demo de imobiliária (sob demanda)

Um comando cria ou remove um tenant demo de imobiliária com dados sintéticos:

- BigQuery: dataset `imobiliaria_demo`, com 20 tabelas;
- Firestore: contrato e produto `imobiliaria`, cliente `imob-demo`, 268 métricas,
  25 templates e, no cliente, 8 grupos com 25 relatórios.

Catálogo de tabelas, métricas e páginas em `docs/real-estate-demo-catalog.md`.

```bash
pnpm demo:real-estate --database=dataviz-dev                            # dry-run (padrão): nada é gravado
pnpm demo:real-estate --database=dataviz-dev --apply --project=SEU_PROJECT
pnpm demo:real-estate --database=dataviz-dev --teardown                 # só lista o que seria apagado
pnpm demo:real-estate --database=dataviz-dev --teardown --confirm --project=SEU_PROJECT
```

- `--database` é obrigatório em todo modo. O banco de produção (`dataviz`) é recusado
  sem `--allow-prod`; os seeds, rodados direto, também recusam `--apply` em produção
  sem essa flag.
- O BigQuery só é gravado (carga com drop + recriação das tabelas) ou apagado com
  `--project` explícito. O dataset é compartilhado por todos os bancos Firestore do
  mesmo projeto, então um `--database` de desenvolvimento não isola o BigQuery. Sem
  `--project`, a carga e a remoção do dataset são puladas e o comando avisa.
- Os seeds são idempotentes: documento idêntico não muda e documento com conteúdo
  diferente é pulado. `--force` (repassado aos seeds) sobrescreve.
- O teardown apaga o Firestore primeiro e depois o BigQuery. Se parar no meio, repetir
  o teardown é idempotente: só apaga o que ainda existe.
- Dados de runtime com `clientId` `imob-demo` (`workingMemory`, `embeddings*`,
  `sqlCatalog*`, `evalRuns`) não são criados pelos seeds e não são removidos.

Acesso: o `--apply` termina imprimindo como conceder o cliente, e o teardown, como
revogá-lo (ele não mexe nos claims):

```bash
pnpm tsx scripts/grant-claims.ts --email=voce@empresa.com --clientIds=<atuais>,imob-demo   # conceder
pnpm tsx scripts/grant-claims.ts --list
pnpm tsx scripts/grant-claims.ts --email=voce@empresa.com --clientIds=<atuais sem imob-demo> # revogar
```

Depois de mudar claims, saia e entre de novo no app (o JWT antigo não carrega o
tenant novo).

### 4.2 Observabilidade SQL / BQML (opcional)

```bash
pnpm bq:bootstrap-meta    # cria SEU_PROJECT.dataviz_meta.sql_generations
pnpm bq:bootstrap-bqml --database=dataviz --project=SEU_PROJECT
```

O prefixo de dataset BQML é `dataviz_bqml_<cliente>` (hífen do id vira underscore).

### 4.3 Tabelas auxiliares (opcional)

`pnpm bq:load-aux` grava `dataviz_aux.ba_bancos` e `dataviz_aux.ba_pluggy_categorias` com dados reais. Os CSVs de origem ficam em `docs/bases/` (gitignored — dumps de cliente). Sem eles, pule este passo: o 4.1 já deixou as tabelas vazias, então as métricas de transação bancária rodam e devolvem zero linhas.

## 5. Configuração no Firestore

A aplicação sobe vazia até existirem: `dataSources`, `products`, `dataContracts`, `clients` (com `productBindings`), `groups` e pelo menos um `users`.

### 5.1 Base: origem BigQuery, contratos e produtos

```bash
pnpm seed:base -- --dry-run
pnpm seed:base -- --apply                # recusado no banco `dataviz` sem --allow-prod
```

O seed trata o banco `dataviz` como produção: `--apply` nele exige
`--allow-prod`, e `--dry-run` junto com `--apply` é recusado. Numa instalação
de teste em que `dataviz` é o único banco, acrescente `--allow-prod`.

Cria `dataSources/SEU_PROJECT`, os contratos `liquid-play` (com entidades e
atributos do monitor) e `liquid-play-plus`, e os produtos `liquid-play` e
`liquid-play-plus`. Nenhum outro seed cria isso — em produção veio de um
export de ambiente real — e sem essa base o passo 5.2 aborta.

⚠️ **O id do documento em `dataSources/` é o id do projeto GCP**, não um
slug livre. O front monta `${dataSourceId}.${datasetId}` e o servidor lê
como `projeto.dataset` (`/api/filter-options` e as tools de IA). Um id como
`bigquery-default` faz o BigQuery responder "Access Denied: Table
bigquery-default:…" e os relatórios ficam em branco. `DATA_SOURCE_ID` no
`.env.local` tem de ser o mesmo valor.

### 5.2 Cliente, contrato e relatórios

Caminho curto, com o Vila Rosa como molde (exige 4.1 e 5.1 feitos).

Todos os seeds abaixo tratam o banco `dataviz` como produção: nele, cada um
exige `--allow-prod` para gravar, e `--dry-run` junto com `--apply` é recusado.
Contra outro banco (`DATAVIZ_DATABASE_ID=dataviz-dev`, por exemplo) a flag não
é necessária. O `seed:ai-studio` grava sem `--apply` — não tem modo dry-run —,
então no `dataviz` ele pede `--allow-prod` em toda execução e recusa `--dry-run`.

```bash
# scripts leem NEXT_PUBLIC_FIREBASE_PROJECT_ID / DATAVIZ_DATABASE_ID do ambiente
# (tsx não carrega .env.local sozinho — exporte ou use --env-file)
# comandos para o banco de produção (dataviz); em outro banco, tire o --allow-prod
pnpm exec tsx --env-file=.env.local scripts/seed-liquid-play-plus-v2-contract.mjs --apply --allow-prod
pnpm exec node --env-file=.env.local scripts/seed-covenants-v2-relations.mjs --apply --allow-prod
pnpm exec node --env-file=.env.local scripts/seed-covenants-v2-metrics.mjs --apply --allow-prod
pnpm exec tsx --env-file=.env.local scripts/seed-covenants-templates.ts --apply --allow-prod
pnpm exec node --env-file=.env.local scripts/seed-vila-rosa-client.mjs --apply --allow-prod
pnpm exec node --env-file=.env.local scripts/seed-vila-rosa-reports.mjs --apply --allow-prod
pnpm exec tsx --env-file=.env.local scripts/seed-ai-studio.ts --allow-prod
```

Caminho ainda mais curto: crie cliente/produto/contrato pela UI `/admin` depois do primeiro login (passo 6). Bindings do cliente devem apontar `dataSourceId` + `datasetId` para o dataset que você carregou.

### 5.3 Primeiro usuário

`export-provisioning` não copia `users` (PII). Sem este passo o Firestore tem páginas e ninguém entra.

```bash
pnpm provisioning:bootstrap-user \
  --email=voce@empresa.com \
  --database=dataviz \
  --project=SEU_PROJECT \
  --role=admin \
  --password='troque-isto'
```

`--role=admin` grava o custom claim que as regras do Firestore exigem. O e-mail no domínio `ADMIN_EMAIL_DOMAIN` também é admin nas rotas HTTP.

O script trata o banco `dataviz` como produção e recusa sem `--allow-prod`.
Numa instalação de teste em que `dataviz` é o único banco, acrescente a flag.

## 6. Subir local

```bash
pnpm dev
```

Abra http://localhost:3005/dashboard. Em desenvolvimento o bypass de auth está ativo na ausência de `FIREBASE_ADMIN_PRIVATE_KEY`. Para testar login de verdade, preencha `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY` **ou** use ADC e crie o usuário no Authentication.

Docker (imagem de produção local):

```bash
docker compose --env-file .env.local up --build -d
# http://localhost:4400
```

As chaves montadas em `./secrets/*.json` estão no `.gitignore`.

### Playground do Mastra (local)

Studio do Mastra com os agentes do assistente — supervisor e os 8
especialistas —, montados pelo mesmo código de `/api/chat`:

```bash
MASTRA_DEV_ALLOW_PROD=1 pnpm mastra:dev   # enquanto o único banco for `dataviz`
# Studio: http://localhost:4111   API: http://localhost:4111/api (ex.: GET /api/agents)
```

`pnpm mastra:dev` roda `scripts/mastra-dev.ts`: aplica a guarda de banco (sai
com código 2 se recusar), desliga a telemetria e só então sobe `mastra dev`.
Funciona igual em macOS, Linux e Windows.

- **Sem autenticação — só loopback.** Quem fala com o servidor age em nome do
  cliente configurado, com as credenciais de produção do `.env.local`. Por isso:
  - ele escuta só em `localhost`, que resolve para `[::1]`: use `http://localhost:4111`
    (`http://127.0.0.1:4111` não conecta);
  - um middleware recusa com `403` todo pedido cujo `Host` não seja
    `localhost`, `127.0.0.1` ou `[::1]` na porta do playground (barra DNS
    rebinding) e todo `Origin` fora dessas mesmas origens (barra outra página
    aberta no navegador chamando `/api/agents/*/tools/*/execute`); isso vale
    inclusive para o preflight `OPTIONS`;
  - o CORS devolve só essas origens, nunca `*`.

  Exceção do próprio Mastra: as rotas `/api/auth/*` pulam middleware de
  usuário; sem auth configurado elas só dizem que não há auth. Não exponha a
  porta (túnel, `--host`, container).
- **Fora do app.** `src/mastra/` não é importado pelo app e não entra no bundle
  do `next build` nem na imagem Docker (`.dockerignore`). O `next build` ainda o
  **typecheca** (o `tsconfig` inclui `**/*.ts`): erro de tipo ali quebra o build
  local.
- **Contexto fixo, vindo do env** (`.env.local`, que vence o shell, como no CLI):
  `MASTRA_DEV_CLIENT_ID` (default `vila-rosa`), `MASTRA_DEV_DATASET` (default: o
  dataset principal do cliente no Firestore, mesma regra do navegador),
  `MASTRA_DEV_DATE_START`/`MASTRA_DEV_DATE_END` (default: ano corrente até hoje)
  e `MASTRA_DEV_USER_EMAIL`. Esse e-mail é **autodeclarado**: ninguém o
  autentica. Sem ele as tools de métrica recusam escrever; com ele, as métricas e
  revisões saem assinadas por esse e-mail, e um e-mail do domínio admin
  (`ADMIN_EMAIL_DOMAIN`) pula o `verifyDatasetAccess`.
- **Guarda de banco.** Os agentes ESCREVEM quando uma conversa aciona a tool
  (montar os agentes só lê):
  - Firestore: o supervisor cria relatórios e páginas (basta o cliente) e
    métricas com revisões (exige `MASTRA_DEV_USER_EMAIL`); `execute_sql`
    incrementa uso no catálogo SQL. Os filtros de página não escrevem aqui — o
    playground não tem página aberta.
  - BigQuery: as tools BQML criam modelos (os legados ficam no dataset do
    cliente) e gravam em `dataviz_meta.bqml_model_registry`; com
    `BQML_INVOCATIONS_LOGGING=true` também em `dataviz_meta.bqml_invocations`, e
    com `SQL_GENERATIONS_LOGGING=true` o reparo de SQL grava em
    `dataviz_meta.sql_generations`.

  Por isso o playground recusa subir quando o banco que o `getDb` usaria
  (`resolveDatavizDatabaseId`, de `runtime-config.ts`) é `dataviz` e não há
  `MASTRA_DEV_ALLOW_PROD=1`. Atenção: `DATAVIZ_DATABASE_ID=` vazio NÃO cai para
  o `NEXT_PUBLIC_DATAVIZ_DATABASE_ID` — vira `dataviz`. O jeito de cumprir
  `.contexts/engineering/processes/environments.md` (não usar o banco de prod em
  dev) é um banco `dataviz-dev` (`.env.dev.example`); hoje ele não existe, e o
  opt-in é explícito. O BigQuery e o Vertex são os reais, com custo real.
- **Telemetria do CLI desligada.** O launcher define `MASTRA_TELEMETRY_DISABLED=1`,
  a chave que o CLI (`PosthogAnalytics.isTelemetryEnabled`) e o `@mastra/core`
  (telemetria de uso/feature no startup) consultam antes de enviar ao PostHog.
- Threads e mensagens do Studio ficam em memória (sem `storage` no `Mastra`) e
  somem ao reiniciar — não passam pelo `memory-service` do app.

## 7. Armadilhas de uma instalação nova

Cada item abaixo custou horas na primeira instalação limpa (set/2026). Os
scripts já cobrem todos; a lista existe para quem for depurar.

| Sintoma | Causa | Onde está resolvido |
|---|---|---|
| `Firebase: Error (auth/invalid-api-key)` no navegador | client precisa das chaves reais; o bypass de auth é só do servidor | `pnpm setup:firebase` |
| `403` em `addFirebase` mesmo sendo Owner | Termos do Firebase não aceitos pela conta | aceitar no console uma vez |
| Firebase criado como projeto separado | Admin SDK usa um único `projectId` | anexar ao MESMO projeto GCP |
| `seed-liquid-play-plus-v2-contract` aborta: contrato não existe | base de contratos/produtos vinha de export gitignored | `pnpm seed:base` |
| Relatório em branco; `/api/filter-options` 500 `Access Denied: Table bigquery-default:…` | id de `dataSources/` ≠ id do projeto GCP | `pnpm seed:base` + `DATA_SOURCE_ID` |
| Métricas falham com `Unrecognized name` | CSVs de amostra têm menos colunas que o contrato | `pnpm bq:bootstrap-sample` |
| Blocos de extrato "Não foi possível carregar" | JOIN literal em `dataviz_aux.*` inexistente | `pnpm bq:bootstrap-sample` (vazias) ou `pnpm bq:load-aux` |
| Lista de conversas: `The query requires an index` | índices compostos não publicados | `pnpm firestore:deploy-indexes -- SEU_PROJECT dataviz` |
| `bootstrap-user`: "dataviz é PRODUÇÃO" | guarda contra escrita acidental | `--allow-prod` |
| Seletor de cliente preso em "Carregando…" | `useClients` pula o fetch com a aba em segundo plano e não escuta `visibilitychange` | recarregar com a aba visível (bug conhecido) |

## 8. O que este repositório não carrega

| Caminho | Motivo |
|---|---|
| `.env.local`, `.env` | credenciais |
| `secrets/` | JSON de service account |
| `docs/bases/` | dumps de carteira de cliente |
| `docs/backups/` | export de configuração/PII de ambiente antigo |
| `fixtures/provisioning/` | clone de configuração de um tenant real |

Para clonar **só configuração** (sem PII) de um ambiente que você controla:

```bash
pnpm provisioning:export --database=dataviz --project=SEU_PROJECT
pnpm provisioning:seed --database=dataviz-dev --from=fixtures/provisioning
```

## Branch

A branch principal é `develop`.

---

Arquitetura canônica: `adrs/decisions/` (ADR-0013 Firestore, ADR-0015 camada semântica, ADR-0020 assistente único). Harness DDC: `CLAUDE.md` e `.contexts/`.
