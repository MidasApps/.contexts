---
name: firebase-functions
description: "Use para Firebase Cloud Functions — triggers, http, scheduled, callable. Keywords: firebase functions, cloud functions."
---
# Firebase Cloud Functions

Serverless do Firebase/GCP: gen 2 (Cloud Run-backed) é o default. Triggers HTTP, Firestore, Auth, Storage, Pub/Sub, Scheduler, Eventarc.

Pins: `firebase-functions@7.4.0` + `firebase-admin@14.5.0`. **Runtime `nodejs24`** com `engines.node` `">=24.0.0 <25"` no pacote de functions — exceção E1 do ADR 0004 (`@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md`): o Google não oferece `nodejs26`. O resto do monorepo roda Node 26.

## Essência
- **Gen 2 (`firebase-functions/v2`)**: roda sobre Cloud Run; melhor concurrency, recursos configuráveis, cold start mais previsível.
- **Tipos de trigger:**
  - `onRequest` (HTTP cru), `onCall` (callable do client SDK com auth integrado).
  - `onDocumentWritten/Created/Updated/Deleted` (Firestore).
  - `onObjectFinalized` (Storage), `onSchedule` (cron), `onMessagePublished` (Pub/Sub).
  - Auth: `beforeUserCreated/SignedIn` (blocking functions).
- **Config por função:** `{ region, memory, timeoutSeconds, minInstances, maxInstances, concurrency, secrets }` em options.
- **Secrets:** `defineSecret("STRIPE_KEY")` → injetar em `secrets: [STRIPE_KEY]`; valor via `STRIPE_KEY.value()`.
- **Params:** `defineString/Int/Bool` para config tipada por env.
- **Cold start:** importar lazy (`await import(...)` dentro do handler) reduz tempo de boot para libs grandes.
- **Concurrency:** gen 2 default 80 req/instance — atenção a estado global.
- **Streaming:** `onCall` também streama (`request.acceptsStreaming` + `response.sendChunk()`; cliente `.stream()`).
- **Auth no `onCall`:** `request.auth.uid` disponível; sem auth → throw `HttpsError("unauthenticated")`.
- **Deploy:** `firebase deploy --only functions:nameOfFunction`.
- **Local:** Firebase Emulators (`firebase emulators:start`).

## Procedimento mínimo
1. Init: `firebase init functions` (TypeScript). Conferir `"engines": { "node": ">=24.0.0 <25" }` e `runtime: "nodejs24"`. Estruturar funções por feature em `src/`, arquivos kebab-case.
2. Para mutation com client SDK → `onCall` (auth grátis).
3. Para webhook externo → `onRequest` + verificar signature.
4. Para reagir a dados → trigger Firestore/Storage (idempotente!).
5. Configurar `region`, `memory`, `timeoutSeconds` por função.
6. Secrets via `defineSecret` (Secret Manager).
7. Validar input (Zod) na primeira linha.
8. Logger estruturado: `logger.info("charge_created", { uid, durationMs })` (`firebase-functions/logger`: mensagem primeiro, campos depois).

## Anti-patterns
- Conexão de DB criada dentro do handler em vez de top-level → cold start desnecessário.
- Trigger Firestore não-idempotente → eventos podem ser entregues > 1x.
- `process.env.SECRET` direto → use `defineSecret`.
- Subir o runtime para Node 26 ou usar API exclusiva da 26 no código de functions → deploy falha (E1).
- Função monolítica de 30 endpoints → quebrar por feature.

## Mini-exemplo
```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const STRIPE_KEY = defineSecret("STRIPE_KEY");

export const createCharge = onCall(
  { region: "southamerica-east1", secrets: [STRIPE_KEY], memory: "512MiB" },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required");
    // onCall: lê x-request-id do request HTTP cru; ausente → ULID novo por chamada (ADR 0005)
    const requestId = req.rawRequest.get("x-request-id") ?? newRequestId();
    const parsed = CreateChargeInputSchema.safeParse(req.data);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({ field: i.path.map(String).join("."), issue: i.code.toUpperCase() }));
      throw new HttpsError("invalid-argument", "One or more fields are invalid.", { code: "VALIDATION_FAILED", details, requestId });
    }
    const input = parsed.data;
    return charge(STRIPE_KEY.value(), req.auth.uid, input);
  }
);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/backend/firebase-functions.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
