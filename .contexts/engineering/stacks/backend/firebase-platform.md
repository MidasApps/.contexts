---
title: Firebase Platform
type: stacks
category: backend
version: "firebase 12.19.0 / firebase-admin 14.5.0 / firebase-tools 15.32.0 / @apphosting/adapter-nextjs 14.0.21"
last_updated: 2026-09-29
status: current
upstream:
  - https://firebase.google.com/docs
  - https://firebase.google.com/docs/app-hosting
  - https://firebase.google.com/docs/emulator-suite
---

# Firebase Platform

Produtos Firebase que o core usa além do Firestore e das Functions: Auth (e Identity Platform), App Hosting, Cloud Storage, App Check, Remote Config, FCM e o Emulator Suite. Cada seção diz o papel do produto na topologia (`@.contexts/engineering/decisions/0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md`) e na divisão de dados (`@.contexts/engineering/decisions/0008-data-stores-split-firestore-postgres-storage-bigquery.md`), e o que muda na versão atual.

Não se repete aqui:

- Firestore: `@.contexts/engineering/stacks/database/firebase-firestore.md` e `@.contexts/engineering/contracts/firebase-firestore.md`.
- Functions: `@.contexts/engineering/stacks/backend/firebase-functions.md`.
- Secrets: `@.contexts/engineering/contracts/secrets.md`.
- Ambientes, região e projetos por ambiente: `@.contexts/engineering/processes/environments.md`.

## Versões

Pins de `@.contexts/engineering/MEMORY.md`: `firebase` 12.19.0 (client), `firebase-admin` 14.5.0, `firebase-tools` 15.32.0 (só dev e CI), `@firebase/rules-unit-testing` 5.0.2. `@apphosting/adapter-nextjs` 14.0.21 (medido em 2026-09-29, `npm view`) declara peer `next: *`, o que não prova suporte ao Next 16.

## Auth e Identity Platform

Papel: identidade de usuário de web e desktop. O `/v1` e o servidor Mastra validam o ID token Firebase com o Admin SDK (`getAuth().verifyIdToken`).

- Web: login pelo client SDK no `apps/web`. O token segue em `Authorization: Bearer` para o `/v1` (a mesma forma que o desktop usa, 0007).
- Desktop: o fluxo de login dentro da webview do Tauri (origem customizada, domínios autorizados) é spike do SP0b (0007).
- **Identity Platform** é o upgrade do Firebase Auth que habilita blocking functions (`beforeUserCreated`, `beforeUserSignedIn`), multi-tenancy de identidade e SAML/OIDC corporativo. O tenant do core (Organização, D4) **não** é um tenant do Identity Platform: o modelo de tenancy e o uso de custom claims ficam no ADR de tenancy (SP0a Task 5).
- Custom claims viajam no ID token: projeção pequena, nunca fonte de verdade de permissão (Task 5).

## App Hosting

Papel: host do `apps/web` (UI, Server Actions e `/v1`), 0009.

| Tema | Estado em 2026-09-29 |
|---|---|
| Next.js suportado | Tabela oficial vai até **15.2.x** (atualizada em 2026-09-24). Next 16.3 **não confirmado**: spike do SP0b (spec §14 item 1) |
| Runtime Node | Exemplos da doc: `nodejs20`, `nodejs22`, `nodejs24`, "espelhando o Cloud Run", onde `nodejs26` é Preview. O core usa **`nodejs24`** (ADR 0004, **E6**) |
| `engines` | O runtime escolhido precisa ser compatível com `engines.node` do `package.json`, ou o Cloud Build falha. `apps/web` declara `>=24.0.0 <25` (E6) |
| Configuração | `apphosting.yaml` na raiz do app: `runConfig` (`cpu`, `memoryMiB`, `minInstances`, `maxInstances`, `concurrency`, `vpcAccess`) e `env` |
| Secrets | `env` com `secret:` apontando para o Secret Manager (`variable: X`, `secret: nome`) |
| Rollout | automático a cada push na branch viva, ou manual (`firebase apphosting:rollouts:create BACKEND_ID`) |
| Rollback | pelo console, aba Rollouts: instantâneo (mesma imagem) ou rebuild com a configuração atual |
| Traffic split / canary | não documentado. Canary do web é por feature flag |
| Deploy por CLI | `firebase deploy --only apphosting:<backendId>` a partir do código local (firebase-tools ≥ 14.4.0), com `rootDir` no `firebase.json` |

```yaml
# apps/web/apphosting.yaml (valores de partida para o spike)
runConfig:
  minInstances: 1
  maxInstances: 20
  concurrency: 80
env:
  - variable: APP_ENV
    value: prod
  - variable: MASTRA_URL
    value: https://mastra-<hash>-<region>.a.run.app
  - variable: OPENAI_API_KEY
    secret: OPENAI_API_KEY
```

- **Monorepo:** o `firebase deploy` sobe o diretório pai do `firebase.json` inteiro para o build. O `firebase.json` fica na raiz e aponta `rootDir: apps/web`; `ignore` exclui `apps/desktop`, `apps/mastra` e artefatos.
- **Branch viva:** o core promove por tag (`processes/deploy.md` §3). Rollout automático por push só em `staging` (branch `main`); em `prod` o rollout é disparado pelo pipeline da tag.
- **Emulator:** o App Hosting emulator roda o comando de dev do package manager (ou `startCommand`) e lê `apphosting.emulator.yaml`, que pode ser commitado. `apphosting.local.yaml` é legado e não se commita. Fallback local: `next dev` (spec §14 item 1).

## Cloud Storage for Firebase

Papel: bytes de upload e fontes de ingestão da knowledge base (0008).

- Path com prefixo de tenant: `tenants/{tenantId}/...`. Metadados do arquivo no Firestore.
- Escrita do cliente negada por padrão (D8). Como o upload é autorizado (URL assinada emitida pelo `/v1` ou Storage Rules com escopo mínimo) fica no ADR de tenancy (SP0a Task 5).
- Reação a upload: `onObjectFinalized` nas Functions dispara a ingestão (`stacks/backend/firebase-functions.md`). A ingestão em si é workflow do Mastra (spec §7).
- Storage Rules versionadas no repo e deployadas com `firebase deploy --only storage` (`processes/deploy.md` §4).

## App Check

Papel: atestar que o request vem do app oficial.

- Web: provider **reCAPTCHA Enterprise** (a doc também oferece reCAPTCHA v3). O token vai no header `X-Firebase-AppCheck` e o `/v1` valida com `getAppCheck().verifyToken()` do Admin SDK.
- Desktop e Android no Tauri: provider de atestação dentro da webview é spike do SP0b (0007).
- Local e CI: **debug provider** (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` antes de `initializeAppCheck`; em CI, o token vem de secret). O debug token nunca entra no repositório.
- Enforcement liga por produto depois de medir a taxa de tokens válidos. Ligar antes bloqueia clientes legítimos.

## Remote Config

Papel no core: configuração dinâmica lida pelo servidor (por exemplo, parâmetros de feature flag). O Admin SDK tem templates de servidor (`getRemoteConfig().getServerTemplate()`) avaliados no `/v1` ou no Mastra.

- Remote Config não substitui a política de feature flags de `rules/governance.md`. Se ele será o provider do port de flags é decisão do SP0b.
- Não há emulator de Remote Config no Emulator Suite: em `local`, o adapter lê um template fixo do repo.
- Nada de segredo em Remote Config: é config, não Secret Manager.

## Cloud Messaging (FCM)

Papel: push de notificações (contexto `notifications`).

- Web: exige service worker `firebase-messaging-sw.js` servido pelo `apps/web` e a chave VAPID do projeto.
- Envio pelo servidor com o Admin SDK (`getMessaging().send`), a partir do contexto `notifications` de `packages/services`, nunca do cliente.
- Tauri (principalmente Android): sem plugin oficial de push. Spike do SP0b (0007).
- Tokens de dispositivo são dado do usuário (LGPD por padrão, `business/compliance.md`): guardar com dono e apagar quando o token expira.

## Emulator Suite

Papel: ambiente `local` (D10). O setup completo e o comando `pnpm dev` ficam em `processes/environments.md` §9 (SP0a Task 9).

| Emulator | Porta default | Env var do Admin SDK |
|---|---|---|
| Emulator Suite UI | 4000 | — |
| Authentication | 9099 | `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` |
| Cloud Firestore | 8080 | `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` |
| Cloud Functions | 5001 | — |
| Cloud Storage | 9199 | `FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199` |
| Pub/Sub | 8085 | `PUBSUB_EMULATOR_HOST=127.0.0.1:8085` |
| Eventarc | 9299 | — |
| App Hosting | 5002 | — |

Os demais processos locais usam 3000 (`next dev`) e 4111 (`mastra dev` e Studio). Nenhuma colisão com a tabela.

- **Tokens do Auth Emulator não são assinados.** O Admin SDK só os aceita com `FIREBASE_AUTH_EMULATOR_HOST` definido. Essa variável nunca existe em `dev`, `staging` ou `prod`: o `env.ts` de cada app rejeita a variável quando `APP_ENV` não é `local`.
- Cliente: `connectAuthEmulator(auth, 'http://127.0.0.1:9099')`, `connectFirestoreEmulator(db, '127.0.0.1', 8080)`, `connectStorageEmulator(storage, '127.0.0.1', 9199)`, só quando `APP_ENV=local`.
- **Persistência entre sessões:** `--import=.firebase-data --export-on-exit` (vale para Auth, Firestore, Realtime Database e Storage). `.firebase-data/` fica no `.gitignore`.
- **Testes de integração:** `firebase emulators:exec "<comando>"` sobe os emulators, roda o comando e derruba tudo no fim. É o modo de CI (`rules/testing.md`).
- Testes de Security Rules com `@firebase/rules-unit-testing` contra o emulator do Firestore e do Storage.
- BigQuery, Remote Config e App Check não têm emulator: cada um tem adapter local ou debug provider, e a divergência fica registrada em `processes/environments.md` §2.
- Firebase Data Connect (SQL Connect) não é usado no core v1: o emulator dele roda PGlite (0008).

## Anti-patterns

- `FIREBASE_AUTH_EMULATOR_HOST` fora de `local`: o Admin SDK passa a aceitar token sem assinatura.
- Rollout automático do App Hosting ligado na branch de produção: pula a tag e a aprovação de `processes/deploy.md` §11.
- `apphosting.local.yaml` commitado: pode conter secret em texto puro.
- `engines.node` do `apps/web` em `>=26` com runtime `nodejs24`: o build falha no Cloud Build.
- Escrita do cliente no Storage ou no Firestore "só para upload": viola D8.
- Enforcement de App Check ligado antes de medir: bloqueia clientes reais.
- Secret em Remote Config.
- Tenant do Identity Platform usado como Organização do core sem ADR.

## Referências

- https://firebase.google.com/docs/app-hosting/frameworks-tooling · https://firebase.google.com/docs/app-hosting/configure · https://firebase.google.com/docs/app-hosting/rollouts · https://firebase.google.com/docs/app-hosting/alt-deploy · https://firebase.google.com/docs/app-hosting/emulate
- https://firebase.google.com/docs/emulator-suite/install_and_configure · https://firebase.google.com/docs/emulator-suite/connect_auth
- https://firebase.google.com/docs/app-check/web/debug-provider
- https://firebase.google.com/docs/data-connect/quickstart-local
- `@.contexts/engineering/stacks/backend/cloud-run.md`, `@.contexts/engineering/rules/security.md`, `@.contexts/engineering/rules/testing.md`
