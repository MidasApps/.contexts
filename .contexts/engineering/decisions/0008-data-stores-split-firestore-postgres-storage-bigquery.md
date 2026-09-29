# 0008. Divisão de dados: Firestore, Postgres + pgvector, Cloud Storage e BigQuery

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** projeto DDC / spec do core agêntico (`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`, D3, D10, D11)
- **Tags:** `engineering`, `data`, `firestore`, `postgres`, `pgvector`, `storage`, `bigquery`, `mastra`
- **Complements:** [0005](0005-firestore-document-ids-use-automatic-ids.md) (IDs do Firestore e do Postgres seguem valendo em cada store), [0006](0006-monorepo-layout-and-package-boundaries.md) (os adapters de cada store moram em `packages/services` e `packages/agents`) e [0004](0004-latest-stable-baseline-and-documented-exceptions.md) (Postgres 18.6 e pgvector 0.8.6 entram pelo baseline).
- **Superseded in part by:** [0011](0011-contracts-as-machine-readable-data-catalog.md) (só a regra "BigQuery nunca lido no caminho do request", para a leitura analítica da tool SQL do agente durante o chat, desligada até o SP3 definir o isolamento por tenant).
- **Complemented by:** [0011](0011-contracts-as-machine-readable-data-catalog.md) (schema Postgres `semantic` e datasets BigQuery `<context>_semantic` para as views semânticas).

## Context

O core agêntico guarda quatro tipos de dado, com exigências diferentes:

1. **Dados da aplicação.** Identidade, tenancy, acesso, perfil e notificações dos contextos de `architecture/monorepo.md`. O cliente precisa ver mudanças em tempo real. A escrita direta do cliente é negada (D8): toda mutação passa por `/v1`.
2. **Estado do runtime agêntico.** O Mastra persiste nove domínios de storage: `memory` (threads, mensagens, working memory), `workflows` (snapshots de suspend/resume), `observability`, `scores`, `datasets`, `experiments`, `backgroundTasks`, `schedules` e `threadState`. A memória semântica e a knowledge base precisam de busca vetorial com filtro por tenant.
3. **Arquivos.** Uploads do chat e da ingestão da knowledge base (bytes, não registros).
4. **Analítico.** Custos e tokens por tenant, histórico de evals e métricas de uso para o `/admin` (spec §10). Leitura agregada, fora do caminho de request.

Fatos medidos em 2026-09-29:

- A página de storage do Mastra (`mastra.ai/docs/storage`) lista os providers suportados: Aurora DSQL, ClickHouse, Cloudflare D1 e KV, Convex, DuckDB, DynamoDB, Elasticsearch, Google Cloud Spanner, LanceDB, libSQL, MongoDB, MySQL, MSSQL, Neon, OracleDB, PostgreSQL, Redis, Valkey e Upstash. **Firestore não está na lista.**
- A página de vector databases do Mastra (`mastra.ai/docs/rag/vector-databases`) lista 17 vector stores, entre eles PgVector. **Nem Firestore nem Spanner estão na lista.**
- `MastraCompositeStore` roteia domínios de storage para backends diferentes.
- O emulator do Firebase Data Connect roda com um banco **PGlite** local ("Start emulators to run the emulator with a local PGlite database", quickstart local). A doc de 2026-09-29 já chama o produto de **Firebase SQL Connect**.
- `processes/environments.md` §2 declara inaceitável engine de banco diferente entre ambientes e "SQLite em local e Postgres em prod".

## Decision Drivers

- **Suporte oficial do Mastra.** O store do runtime agêntico precisa ser um adapter mantido upstream. Adapter próprio para nove domínios é custo permanente e fica atrás de cada minor do `@mastra/core`.
- **Busca vetorial com filtro relacional.** Knowledge base e semantic recall filtram por tenant e projeto e fazem join com metadados (`contracts/pgvector.md`).
- **Tempo real para o cliente.** Listeners de leitura com Security Rules, sem servidor de push próprio.
- **Paridade de engine entre `local` e `prod`** (`processes/environments.md` §2, D10).
- **Menos infraestrutura para operar.** Cada store extra tem backup, IAM, custo e runbook próprios.
- **Isolamento por tenant verificável** em cada store.
- **Analítico fora do OLTP.** Consultas de custo e eval não disputam recurso com o request.

## Considered Options

1. **Firestore para tudo.** App, storage do Mastra (adapter próprio) e vetores com `findNearest`.
2. **Postgres para tudo.** App, Mastra e vetores num Postgres 18 + pgvector; sem Firestore.
3. **Firestore para a aplicação, Postgres 18 + pgvector para o Mastra e a knowledge base, Cloud Storage para arquivos, BigQuery para analítico.**
4. **Firestore para a aplicação, Spanner para o Mastra e um vector store dedicado** (Pinecone, Qdrant ou equivalente).

Data Connect (SQL Connect) como camada sobre o Postgres é avaliado à parte, em "Data Connect fora da v1".

## Pros and Cons of the Options

**1. Firestore para tudo**
- \+ Um store operacional só, já presente para a aplicação.
- − Não há adapter de storage nem de vector store Firestore no Mastra. O projeto escreveria e manteria os dois, para nove domínios, acompanhando cada minor do core.
- − `findNearest` aceita até 2048 dimensões e cobra 1 leitura por resultado (`stacks/database/firebase-firestore.md`). Sem join com metadados relacionais.
- − Snapshot de workflow e histórico de mensagens crescem sem o modelo de consulta que o Mastra espera.

**2. Postgres para tudo**
- \+ Um banco, ACID, joins, RLS, adapter oficial do Mastra (`@mastra/pg`: `PostgresStore` e `PgVector`).
- − Sem listener de tempo real para o cliente. Push exigiria `LISTEN/NOTIFY` ou replicação lógica mais um servidor de WebSocket/SSE próprio.
- − Sem Security Rules: toda leitura do cliente passaria por API, inclusive as de tempo real.
- − Perde a integração com Auth, triggers de Functions e SDK offline que a spec e o Tauri usam.

**3. Divisão por natureza do dado**
- \+ Cada tipo de dado fica no store que o atende sem adaptação: listeners e Rules no Firestore, adapter oficial e pgvector no Postgres, bytes no Cloud Storage, agregação no BigQuery.
- \+ Um só vector store (pgvector) para knowledge base e semantic recall.
- \+ Paridade local: emulators do Firestore e do Storage e a mesma imagem Postgres de `MEMORY.md`.
- − Dois stores transacionais. Não há transação entre Firestore e Postgres: consistência entre eles é por evento e idempotência (`contracts/events.md`).
- − Isolamento por tenant tem duas implementações (Security Rules e filtro/RLS no Postgres).

**4. Firestore + Spanner + vector store dedicado**
- \+ Spanner tem adapter de storage oficial e escala horizontal.
- − Spanner não é vector store no Mastra: exige um terceiro sistema só para vetores, fora do GCP ou pago à parte.
- − Custo mínimo de Spanner desproporcional para o core; sem emulator com paridade total no Emulator Suite.
- − Três stores transacionais em vez de dois.

## Decision Outcome

**Opção 3.** Cada tipo de dado tem um store dono, e nenhum dado tem duas fontes de verdade.

| Dado | Store | Notas |
|---|---|---|
| Dados da aplicação dos contextos do core | **Firestore** (Native) | Leitura em tempo real pelo cliente com Security Rules; escrita só via `/v1` com Admin SDK (D8). Convenções em `@.contexts/engineering/contracts/firebase-firestore.md`; IDs pela 0005. |
| Domínios de storage do Mastra | **Postgres 18.6**, schema `mastra` | `PostgresStore` de `@mastra/pg` para todos os domínios na v1. O adapter é dono das próprias tabelas: migrations do projeto não tocam o schema `mastra`. |
| Semantic recall da memória | **pgvector 0.8.6**, schema `mastra` | `PgVector` de `@mastra/pg`, na mesma instância. |
| Knowledge base (chunks e embeddings) | **pgvector 0.8.6**, schema `ai` | Tabelas do projeto, `@.contexts/engineering/contracts/pgvector.md` (`chunks_v1`, namespace por tenant e projeto). Migrations pelo projeto (`@.contexts/engineering/stacks/database/postgres.md`). |
| Arquivos (uploads, fontes de ingestão) | **Cloud Storage for Firebase** | Prefixo de path por tenant. Metadados do arquivo ficam no Firestore. O cliente não grava direto no bucket (D8); a forma de emitir o upload (URL assinada pelo `/v1` ou Storage Rules) fica no ADR de tenancy e acesso (SP0a Task 5). |
| Analítico: custos e tokens por tenant, histórico de evals, uso | **BigQuery** | Alimentado por export e escrita assíncrona, nunca lido no caminho do request. Convenções em `@.contexts/engineering/contracts/bigquery.md`. |

Regras que acompanham a divisão:

- **Um Postgres por ambiente** (Cloud SQL for PostgreSQL 18, região de `processes/environments.md` §13), com os schemas `mastra` e `ai` e roles separados por schema. Dados de aplicação não vão para o Postgres na v1.
- **Firestore não guarda vetor.** `findNearest` não é usado no core; o vector store é o pgvector.
- **Conteúdo de thread e mensagem tem uma fonte**, o domínio `memory` do Mastra. Uma projeção no Firestore (por exemplo, lista de threads em tempo real) só entra com contrato próprio e é derivada, nunca editada à parte.
- **`MastraCompositeStore`** fica disponível para mover um domínio para outro backend (por exemplo, `observability` para um store colunar). Mover domínio é decisão nova, com ADR.
- **Sem transação distribuída.** Operação que toca Firestore e Postgres usa evento com `eventId` ULID e consumidor idempotente (`@.contexts/engineering/contracts/events.md`).

### Data Connect fora da v1

Firebase Data Connect (SQL Connect) não entra no core v1. O emulator dele roda PGlite, não Postgres 18: `local` teria engine diferente de `staging` e `prod`, o que `processes/environments.md` §2 proíbe. O core também não precisa de uma segunda camada de acesso ao Postgres: o schema `mastra` é do adapter do Mastra e o schema `ai` é do projeto via Drizzle. Menções a Data Connect na doutrina passam a "não usado no core v1". Revisar se o emulator passar a aceitar um Postgres real com a versão do baseline e surgir caso de uso que Drizzle não atenda.

Por que não a 1: exige adapter próprio para nove domínios e para vetores, sem suporte upstream. Por que não a 2: troca listeners e Rules prontos por infraestrutura de push própria. Por que não a 4: adiciona um terceiro store transacional e um vector store externo sem ganho para o core.

**Versões:** Postgres 18.6, pgvector 0.8.6, `@mastra/pg` 1.27.1 e SDKs Firebase estão no baseline de `MEMORY.md`. Nenhuma linha nova na tabela de exceções da 0004.

## Consequences

**Melhora:**
- O runtime agêntico usa só adapters oficiais do Mastra.
- Um vector store para knowledge base e memória, com filtro relacional e RLS disponível.
- `local` roda as mesmas engines que `prod` para Firestore, Storage e Postgres.
- Consultas de custo e eval saem do banco transacional.

**Piora:**
- Dois stores transacionais para operar: backup, PITR, IAM e alerta de cada um (`processes/deploy.md` §18).
- Isolamento por tenant em duas tecnologias: Security Rules no Firestore, filtro obrigatório por `tenant_id` (e RLS quando adotada) no Postgres. As regras ficam no ADR de tenancy (SP0a Task 5).
- Consistência entre Firestore e Postgres é eventual e depende de consumidor idempotente.
- Conexões ao Postgres vêm do servidor Mastra no Cloud Run e, quando houver, de Functions: o orçamento de conexões e o pooler precisam ser dimensionados (`stacks/database/postgres.md`, "Connection pooling").
- BigQuery não tem emulator no Emulator Suite. Em `local`, a escrita analítica usa um adapter fake ou um dataset de `dev` isolado; a escolha é do SP0b e precisa ser registrada como divergência em `processes/environments.md` §2.

**Pontos em aberto:**
- Store do audit log (separado do log técnico, spec §10): ADR de tenancy e acesso (SP0a Task 5).
- Como o adapter `@mastra/pg` migra as próprias tabelas entre minors e se aceita schema dedicado com role sem `CREATE` fora dele: spike do SP0b.
- Caminho de export Firestore → BigQuery (extensão oficial, Storage Write API a partir de Functions ou job agendado): SP5.

**Arquivos que passam a mudar:**
- Novo `stacks/backend/firebase-platform.md` (Storage, Emulator Suite, App Hosting).
- `stacks/ai/mastra-sdk.md` ganha "Firestore não suportado" (SP0a Task 7).
- `processes/environments.md` §9 descreve o ambiente local com os emulators e o Postgres (SP0a Task 9).
- `MEMORY.md` e o índice de `decisions/README.md`.

## References

- `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §2 (D3, D8, D10, D11), §7, §10, §11
- `@.contexts/engineering/stacks/database/firebase-firestore.md`, `@.contexts/engineering/stacks/database/postgres.md`, `@.contexts/engineering/stacks/database/pgvector.md`, `@.contexts/engineering/stacks/database/bigquery.md`
- `@.contexts/engineering/contracts/pgvector.md`, `@.contexts/engineering/contracts/events.md`, `@.contexts/engineering/processes/environments.md`
- [0004](0004-latest-stable-baseline-and-documented-exceptions.md), [0005](0005-firestore-document-ids-use-automatic-ids.md), [0006](0006-monorepo-layout-and-package-boundaries.md)
- https://mastra.ai/docs/storage · https://mastra.ai/docs/rag/vector-databases
- https://firebase.google.com/docs/data-connect/quickstart-local (emulator com PGlite; produto renomeado SQL Connect)
