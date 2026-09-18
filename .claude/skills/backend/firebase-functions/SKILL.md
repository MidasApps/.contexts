---
name: firebase-functions
description: Use para Firebase Cloud Functions — triggers, http, scheduled, callable. Keywords: firebase functions, cloud functions.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Firebase Cloud Functions

Serverless do Firebase/GCP: gen 2 (Cloud Run-backed) é o default. Triggers HTTP, Firestore, Auth, Storage, Pub/Sub, Scheduler, Eventarc.

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
- **Auth no `onCall`:** `request.auth.uid` disponível; sem auth → throw `HttpsError("unauthenticated")`.
- **Deploy:** `firebase deploy --only functions:nameOfFunction`.
- **Local:** Firebase Emulators (`firebase emulators:start`).

## Procedimento mínimo
1. Init: `firebase init functions` (TypeScript). Estruturar funções por feature em `src/`.
2. Para mutation com client SDK → `onCall` (auth grátis).
3. Para webhook externo → `onRequest` + verificar signature.
4. Para reagir a dados → trigger Firestore/Storage (idempotente!).
5. Configurar `region`, `memory`, `timeoutSeconds` por função.
6. Secrets via `defineSecret` (Secret Manager).
7. Validar input (Zod) na primeira linha.
8. Logger estruturado: `logger.info({ uid }, "...")` (firebase-functions/logger).

## Anti-patterns
- Conexão de DB criada dentro do handler em vez de top-level → cold start desnecessário.
- Trigger Firestore não-idempotente → eventos podem ser entregues > 1x.
- `process.env.SECRET` direto → use `defineSecret`.
- Função monolítica de 30 endpoints → quebrar por feature.

## Mini-exemplo
```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const STRIPE_KEY = defineSecret("STRIPE_KEY");

export const createCharge = onCall(
  { region: "southamerica-east1", secrets: [STRIPE_KEY], memory: "512MiB" },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "");
    const input = ChargeSchema.parse(req.data);
    return charge(STRIPE_KEY.value(), req.auth.uid, input);
  }
);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/backend/firebase-functions.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
