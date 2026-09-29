---
title: Firebase Cloud Functions
type: stacks
category: backend
version: firebase-functions@7.4.0 / firebase-admin@14.5.0
runtime: nodejs24
generation: gen2
last_updated: 2026-09-28
status: current
upstream: https://firebase.google.com/docs/functions
---

# Firebase Cloud Functions

Camada de backend serverless do projeto. Padrão obrigatório: **Cloud Functions for Firebase, Generation 2**, sobre runtime **`nodejs24`** (exceção E1 ao baseline Node 26 de `@stacks/runtime/node@26`, pois não existe runtime `nodejs26`; ver ADR 0004; Cloud Run functions nodejs24 em GA desde nov/2025), escritas em TypeScript estrito (ver `@stacks/language/typescript@7`).

Gen 1 é **legacy**: não escrever código novo em Gen 1. Migrações Gen 1 → Gen 2 são decisões registradas em `@decisions/`.

## Pacotes e versões

- `firebase-functions` **7.4.0** (Gen 2 APIs em `firebase-functions/v2/*`)
- `firebase-admin` **14.5.0** (o peer de functions aceita 11–14; o projeto fica na 14)
- SDK cliente `firebase` **12.19.0** quando o app precisar do client
- Runtime de deploy: `nodejs24` (o Cloud Functions não oferece `nodejs26`; exceção E1 do ADR 0004, revisar quando o Google publicar `nodejs26`). `engines` do pacote de functions: `">=24.0.0 <25"` e `@types/node@24`; o resto do monorepo fica em `>=26.0.0 <27`. Código compartilhado com o app não usa API removida na 26 nem API que só existe na 26. Não abrir função nova em `nodejs22`
- `firebase-tools` (CLI) — só dev/CI, nunca dependência de runtime

Imports canônicos:

```ts
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { beforeUserCreated, beforeUserSignedIn } from 'firebase-functions/v2/identity';
import { defineSecret, defineString, defineInt } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
```

Não importar de `firebase-functions/v1/*` em código novo.

## Tipos de Function suportados

| Tipo | Trigger | Uso |
|---|---|---|
| HTTPS | `onRequest` | webhooks, APIs REST públicas/internas; handler estilo Express (`req`, `res`) |
| Callable | `onCall` | chamadas client → backend autenticadas via Firebase Auth, payload e response tipados |
| Firestore | `onDocumentCreated`, `onDocumentUpdated`, `onDocumentDeleted`, `onDocumentWritten` | reagir a writes em Firestore (ver `@stacks/database/firebase-firestore`) |
| Storage | `onObjectFinalized` e variantes | uploads de blob, geração de thumbnails, ingestão |
| Pub/Sub | `onMessagePublished` | jobs event-driven assíncronos |
| Scheduled | `onSchedule` | cron-like (`'every 5 minutes'`, crontab) |
| Identity (blocking) | `beforeUserCreated`, `beforeUserSignedIn` | validar/enriquecer signup/login antes de gravar |
| Eventarc | `onCustomEventPublished` | eventos custom internos |
| Tasks | `onTaskDispatched` | consumidores de Cloud Tasks |
| Remote Config | `onConfigUpdated` | reagir a publicação de RC |

**Regra de seleção**: client autenticado → `onCall`; webhook externo → `onRequest` com validação manual; reação a dado mutado → trigger nativo; agendado → `onSchedule`; assíncrono inter-serviços → Pub/Sub ou Tasks.

## Configuração de runtime (Gen 2)

Em Gen 2 não existe `runWith` — opções vão inline na função ou globais via `setGlobalOptions`.

```ts
setGlobalOptions({
  region: 'southamerica-east1',
  memory: '512MiB',
  timeoutSeconds: 60,
  maxInstances: 100,
  concurrency: 80,
  cpu: 1,
});
```

Opções por função sobrescrevem as globais:

```ts
export const heavyAi = onRequest(
  { memory: '4GiB', timeoutSeconds: 540, cpu: 2, concurrency: 1 },
  handler,
);
```

### Region

Pinning obrigatório. Default do Firebase (`us-central1`) **não é aceitável** para dados sujeitos a LGPD — preferir `southamerica-east1` quando o dado é regulado (ver `@rules/governance`). Region é fixada na criação; mudar exige redeploy com nome novo.

### Memory

256MiB → 32GiB. Default 256MiB. Workloads de LLM e parsing pesado costumam exigir 1GiB+. CPU escala junto com memória nos tiers menores; para CPU dedicado use o param `cpu` explícito.

### Timeout

Gen 2: até 60 min (3600s) para funções HTTP (`onRequest`, `onCall`) e até 9 min (540s) para funções event-driven (Firestore, Pub/Sub, Storage, scheduler); Gen 1 era 9 min para todos (firebase.google.com/docs/functions/version-comparison). HTTPS streaming de LLM costuma exigir `timeoutSeconds: 540`+. Não confie no default de 60s.

### Concurrency

Gen 2 suporta até 1000 req/instância. Default 80. Gen 1 era sempre 1.

**Consequência crítica**: com `concurrency > 1`, estado mutável em escopo de módulo é compartilhado entre requests da mesma instância. Caches in-memory precisam ser request-scoped ou imutáveis. Ver `@rules/performance`.

### minInstances / maxInstances

- `minInstances`: instâncias mantidas warm. Elimina cold start em endpoints críticos, mas tem **custo fixo contínuo** mesmo sem tráfego.
- `maxInstances`: teto de escala. Sempre setar — proteção contra runaway de custo em incidente ou loop.

### VPC, ingress, secrets

- `vpcConnector` / `vpcConnectorEgressSettings` para acessar VPC privada (Postgres em Cloud SQL, ver `@stacks/database/postgres`).
- `ingressSettings`: `'ALLOW_ALL'` (default), `'ALLOW_INTERNAL_ONLY'`, `'ALLOW_INTERNAL_AND_GCLB'`.
- `secrets`: lista de `defineSecret` (ver seção Secrets).

## Params tipados (config + Secret Manager)

Substitui `functions.config()` (Gen 1) e leituras cruas de `process.env`:

```ts
const OPENAI_KEY = defineSecret('OPENAI_API_KEY');
const PROVIDER = defineString('AI_PROVIDER', { default: 'openai' });
const MAX_TOKENS = defineInt('MAX_TOKENS', { default: 2048 });

export const chat = onCall(
  { secrets: [OPENAI_KEY] },
  async (request) => {
    const key = OPENAI_KEY.value();
    // ...
  },
);
```

`defineSecret` integra direto com Secret Manager: o valor só é injetado em runtime, nas funções que declaram o secret. Ver `@rules/security` e `@contracts/secrets`.

## Validação na borda

Toda entrada externa (`onRequest` body/query/headers, `onCall` data, payload de webhook) passa por `safeParse` Zod antes de qualquer lógica. Ver `@rules/validation` e `@stacks/validation/zod@4`.

```ts
const AskInputSchema = z.object({ sessionId: z.uuid(), prompt: z.string().min(1) });

export const ask = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  // onCall não tem headers() do Next: lê o header do request HTTP cru; ausente → ULID novo por chamada
  const requestId = request.rawRequest.get('x-request-id') ?? newRequestId(); // newRequestId: @/services/shared/request-id
  const parsed = AskInputSchema.safeParse(request.data);
  if (!parsed.success) {
    // details no envelope de contracts/api.md §6 (Callable = RPC interno, §16.2); z.flattenError não sai da função
    throw new HttpsError('invalid-argument', 'One or more fields are invalid.', {
      code: 'VALIDATION_FAILED',
      details: parsed.error.issues.map((i) => ({ field: i.path.map(String).join('.'), issue: i.code.toUpperCase() })),
      requestId,
    });
  }
  // parsed.data já é tipado
});
```

`onRequest` correspondente retorna `400` com envelope de erro (ver `@rules/api-design`).

## Autenticação e App Check

- `onCall`: Firebase Auth ID token é validado automaticamente. Usuário disponível em `request.auth` (`uid`, `token`). `request.auth === undefined` → não autenticado; lançar `HttpsError('unauthenticated', ...)`.
- `onRequest`: validação **manual**. Verificar ID token com `getAuth().verifyIdToken(...)` ou usar API key/HMAC para webhooks. Nunca deixar `onRequest` público sem auth a menos que seja explicitamente um endpoint anônimo documentado.
- **App Check**: setar `enforceAppCheck: true` em `onCall` e `onRequest` chamados a partir de apps mobile/web próprios — mitiga abuso por bots/clientes não-oficiais.

Ver `@rules/security`.

## Cold starts

- **Lazy-load** de deps pesadas (Vercel AI SDK, Mastra, drivers de DB, libs de PDF/imagem) **dentro do handler** ou via `await import(...)`. Top-level imports custam tempo de cold start em toda invocação fria. Ver `@stacks/ai/vercel-ai-sdk`, `@stacks/ai/mastra-sdk`.
- **Reuso de Admin SDK**: inicializar `initializeApp()` uma única vez em escopo de módulo (singleton), nunca dentro do handler.
- `minInstances` para endpoints críticos onde latência fria é inaceitável (trade-off de custo).
- Bundle enxuto: o build do Firebase CLI usa esbuild; manter `dependencies` mínimas e evitar arrastar devDeps por engano.

Ver `@rules/performance`.

## Concorrência e estado de módulo

Com `concurrency > 1`, uma instância atende N requests em paralelo no mesmo processo Node. Implicações:

- Inicialização em escopo de módulo só é aceitável na composition root / entry point da função (`initializeApp()`, clients, schemas). Camadas de domínio e aplicação não têm side effect em import time.
- Singletons read-only (Admin SDK, clients de API com auth estática, schemas Zod compilados) são **seguros e desejáveis**.
- Caches mutáveis em escopo de módulo (`const cache = new Map()`) são **compartilhados** — só usar com chave que inclua identidade do request, e cuidado com vazamento.
- Estado por-request vive em variáveis locais do handler ou em `AsyncLocalStorage`.
- Se a função realmente precisa de isolamento total entre requests, setar `concurrency: 1`.

## Secrets

**NUNCA** `process.env.FOO` para credenciais em código novo:

- `process.env` em Gen 2 carrega vars setadas em `.env` (texto claro no deploy) — adequado só para config não sensível.
- Secrets sensíveis (API keys, tokens, DB passwords): `defineSecret('NAME')` + declarar em `secrets: [NAME]` na função consumidora.

Rotação: manual via console do Secret Manager ou `gcloud secrets versions add`; funções consumidoras reidratam no próximo cold start (ou redeploy para garantir).

Ver `@rules/security` e `@contracts/secrets`.

## Observabilidade

- **Logs**: `logger.info("order_placed", { orderId, tenantId })` (mensagem estável em snake_case + campos; ADR 0003), `logger.warn`, `logger.error` de `firebase-functions/logger`. Saída estruturada já chega no Cloud Logging com severity e payload JSON. Não use `console.log` (rule `development`); o logger de `firebase-functions/logger` é o único canal.
- **Trace**: Cloud Trace via OpenTelemetry instrumentation; propagar `traceparent` entre Functions e clients downstream.
- **Métricas nativas**: invocations, execution time, memory utilization, active instances, errors — Cloud Monitoring sem código adicional.
- **Correlation IDs**: propagar `x-request-id` em `onRequest`; em `onCall` ler `request.rawRequest.get('x-request-id')` ou, se ausente, gerar um ULID por chamada e logar.
- **Nunca logar PII bruta**, tokens, secrets ou bodies de prompt sensíveis.

Ver `@rules/observability`.

## Error handling

### onCall

Lançar `HttpsError(code, message, details?)`. Códigos válidos (subset gRPC):

`'cancelled' | 'unknown' | 'invalid-argument' | 'deadline-exceeded' | 'not-found' | 'already-exists' | 'permission-denied' | 'resource-exhausted' | 'failed-precondition' | 'aborted' | 'out-of-range' | 'unimplemented' | 'internal' | 'unavailable' | 'data-loss' | 'unauthenticated'`

O cliente SDK mapeia para exceção tipada. `details` chega no client e **pode vazar info sensível** — sanitize.

### onRequest

Status HTTP corretos + envelope padronizado (ver `@rules/api-design`). Nunca retornar stack trace bruta.

### Event triggers (Firestore, Storage, Pub/Sub, ...)

Throw → o event runtime rethrows e ativa **retry policy** se configurada. Sem `retry: true`, o evento é descartado após falha.

Ver `@rules/error-handling`.

## Idempotência

Event triggers (Firestore/Storage/Pub/Sub/Tasks) podem entregar o mesmo evento **mais de uma vez** (at-least-once). Handlers de event obrigatoriamente idempotentes:

- Usar `event.id` como chave de dedup (gravar em coleção Firestore com `create` que falha em duplicata, ou Redis SETNX).
- Side effects externos (cobrança, email) atrás de checagem de estado anterior.

`onRequest` e `onCall` são at-most-once do ponto de vista do invoker — a responsabilidade de retry/idempotência fica no client.

Ver `@rules/migration` para idempotência de jobs longos.

## Retry policy

- Event triggers: `{ retry: true }` ativa retry exponencial automático até 7 dias. Sem ele, evento perdido em falha.
- HTTPS: client é responsável por retry. Implementar backoff no caller, e expor `Retry-After` quando lançar `resource-exhausted` ou `unavailable`.

## Integrações do projeto

### Next.js 16

Next vive na Vercel ou Firebase App Hosting (ver `@stacks/frontend/next@16`). Functions são APIs separadas:

- Client React chama `onCall` via Firebase JS SDK (token Auth automático).
- Server Actions / Route Handlers do Next chamam `onRequest` com header de auth, ou usam Admin SDK direto contra Firestore se a action já roda em ambiente trusted com service account.

### Firestore

Triggers nativos (`onDocumentWritten` etc.) e Admin SDK para ler/escrever fora de trigger. Ver `@stacks/database/firebase-firestore`.

### Postgres / pgvector

Functions acessam Cloud SQL via VPC connector + pool de conexões cuidadosamente dimensionado (instances * connections-per-instance facilmente estoura o limite do Postgres). Ver `@stacks/database/postgres` e `@stacks/database/pgvector`.

### AI SDKs

`onRequest` com `timeoutSeconds: 540`+ e streaming via `res.write(chunk); res.flush?.()` é o padrão para chat LLM. Ver `@stacks/ai/vercel-ai-sdk` e `@stacks/ai/mastra-sdk`. `onCall` também streama: o handler verifica `request.acceptsStreaming` e envia com `response.sendChunk(chunk)`; o cliente consome com `.stream()` (firebase.google.com/docs/functions/callable). Use `onCall` quando quiser auth/App Check integrados; `onRequest` com SSE ou chunked transfer quando o consumidor não é o SDK Firebase.

## Deploy

- `firebase deploy --only functions:<name>` — granular, **default em PRs**. Nunca rodar `firebase deploy --only functions` (sem nome) em CI de PR.
- CI/CD com service account dedicado e least-privilege; nunca usar credenciais de owner. Ver `@rules/governance`.
- Releases versionados via tag; rollback via redeploy de commit anterior. Ver `@processes/deploy`.

## Local dev

```bash
firebase emulators:start --only functions,firestore,auth,storage
firebase functions:shell   # REPL para invocar handlers diretamente
```

Emulators leem `.env.local` e respeitam `defineSecret` se o secret estiver definido em `.secret.local`. Testes de integração rodam contra o emulator suite, não contra projeto real.

## Pricing e quotas

Cobrança composta: invocations + GB-second + vCPU-second + egress + ativos de minInstances. Modelo aproximado:

- `minInstances: 1` em região barata: custo fixo mensal não-trivial mesmo zerado em tráfego.
- Bundle pequeno + concurrency alta = menos instâncias = menos custo.
- Egress (resposta saindo da region) custa por GB — relevante para LLM streaming volumoso.

Monitorar billing alerts por função.

## Anti-patterns

- Gen 1 em código novo.
- `process.env` para secrets sensíveis. Use `defineSecret`.
- Top-level `import` de SDKs pesados (Vercel AI, Mastra, Sharp, pg) em função raramente invocada. Lazy-load.
- Estado mutável em escopo de módulo com `concurrency > 1` sem isolamento por request.
- `onRequest` público sem auth nem App Check.
- LLM streaming sem `timeoutSeconds` adequado (default de 60s aborta a resposta).
- Esquecer `setGlobalOptions` → region default `us-central1` em código LGPD-sensível.
- Logar ID tokens, prompts com PII, ou conteúdo de Secret Manager.
- Event trigger sem dedup por `event.id` → side effect duplicado em retry/redelivery.
- `firebase deploy --only functions` (sem `:nome`) em PR → deploy não-relacionado a mudanças do diff.
- Omitir `maxInstances` → runaway de custo em incidente ou loop bug.
- Inicializar Admin SDK dentro do handler em vez de no módulo → cold start desnecessariamente caro.
- Misturar Gen 1 e Gen 2 no mesmo `index.ts` exportando ambos os tipos → confusão de deploy e config.

## Referências

- firebase.google.com/docs/functions
- firebase.google.com/docs/functions/2nd-gen-upgrade
- github.com/firebase/firebase-functions
- cloud.google.com/run/docs (Gen 2 roda sobre Cloud Run)
- cloud.google.com/secret-manager/docs
