# SP0: Task 12 report and SP0 summary

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Contexts read

- Skills: `.claude/skills/using-ddc/SKILL.md`, `.claude/skills/verification-before-completion/SKILL.md`, `.claude/skills/mastra-sdk/SKILL.md`.
- Plan: Task 0 and Task 12.
- Every report in `reports/`, plus `follow-ups.md` and `progress.md`.
- Spec: §7 (Auth), §13, §14, §16.
- `.contexts/engineering/MEMORY.md` (baseline table), ADR 0004 (E1–E5).

Probe code was throwaway and lived in the session scratchpad (`sp0-spikes/`), not in `app/`. Nothing was deployed and no remote Firebase project was used.

## 1. Own `MastraAuthProvider` against the Auth Emulator (spec §14 item 4, §16.2)

**Source:**
- Installed code: `@mastra/core@1.71.0`
  - `dist/server/index.d.ts`
  - `_types/@internal_auth/dist/provider/index.d.ts`
  - `dist/provider-Q76_uhpr.js`
  - `dist/ee-*.js`
- Installed code: `@mastra/server@1.71.0`
  - `dist/helpers-610L0lwQ.js` (`coreAuthMiddleware`)
  - `server-adapter/index.js` (token extraction)
- Installed code: `firebase-admin@14.5.0`
  - `lib/auth/base-auth.js`

**Probe setup:**
- The probe (`probe.mjs`) builds a `Mastra` with `server.auth = new FirebaseMastraAuth()` and one `registerApiRoute("/probe/whoami")`, served by `createNodeServer` from `@mastra/deployer@1.71.0` on 127.0.0.1:4199.
- The provider:
  - `authenticateToken` calls `verifyIdToken(token, true)`;
  - `authorizeUser` checks an in-memory `tenantId:uid` membership set, reading `x-tenant-id` from the request;
  - `mapUserToResourceId` returns `tenantId:uid`.
- Users were created through the emulator REST API (`accounts:signUp`).
- Command: `cd app && pnpm exec firebase emulators:exec --only auth --project demo-core "node probe.mjs"`. It ran twice: once with `NODE_ENV` unset, and once with `NODE_ENV=production` and `mapUserToResourceId` passed through `super()` options.

**API in the installed version (1.71.0):**

```ts
abstract class MastraAuthProvider<TUser = unknown> extends MastraBase {
  constructor(options?: { name?; authorizeUser?; mapUserToResourceId?; protected?; public? });
  abstract authenticateToken(token: string, request: MastraAuthRequest): Promise<TUser | null>;
  abstract authorizeUser(user: TUser, request: MastraAuthRequest): Promise<boolean> | boolean;
  mapUserToResourceId?(user: TUser): string | undefined | null;
}
// MastraAuthRequest = Request | { raw?: Request; headers?; header?(name) }  (Hono-like; `request.header("x")` works)
// Wired as `new Mastra({ server: { auth: provider } })`; custom routes default `requiresAuth: true`.
```

The middleware order is: protected-path check (default `protected: ["/api/*"]`, `public: ["/api", "/api/auth/*"]`, plus custom routes) → `authenticateToken` (a null result or a throw gives **401**) → `requestContext.set("user" | "mastra__user", user)` → `mapUserToResourceId` sets `mastra__resourceId` (an empty or throwing result gives **500**) → `authorizeUser` (false gives **403**, a throw gives **500**).

**Evidence, second run (`NODE_ENV=production`, map through options):**

```
health (public)                              200 {"success":true}
custom route, no token                       401 {"error":"Invalid or expired token"}
custom route, garbage token                  401 {"error":"Invalid or expired token"}
custom route, member, no tenant header       403 {"error":"Access denied"}
custom route, member, tenant-a               200 {"user":{"uid":"iMSI…","tenantId":"tenant-a"},"resourceId":"tenant-a:iMSI…"}
custom route, outsider, tenant-a             403 {"error":"Access denied"}
builtin /api/agents, no token                401 …
builtin /api/agents, member tenant-a         200 {}
token via ?apiKey= query, tenant-a           200 {"user":{…}}            <- gotcha
forged unsigned token, uid ghost             401  lastError: auth/user-not-found
forged unsigned token, uid = member          200 {"user":{…}}            <- gotcha (emulator mode)
member after revokeRefreshTokens             401  lastError: auth/id-token-revoked
   verifyIdToken(checkRevoked=false) after revoke: auth/id-token-revoked
disabled user                                401  lastError: auth/user-disabled
```

**Gotchas (input for SP3 `packages/agents`):**

1. **`mapUserToResourceId` as a subclass method is silently ignored.** The base constructor runs `this.mapUserToResourceId = options?.mapUserToResourceId`, which creates an own property set to `undefined` and shadows the prototype method. The first run returned `"resourceId":null`. There are two fixes: pass it through `super({ mapUserToResourceId })`, or assign it after `super()`. `authorizeUser` as a method is fine, because the constructor only overwrites it when the option is given.
2. **The token can also come from `?apiKey=<token>`.** The server adapter does `authorization` minus `"Bearer "`, then falls back to `getQuery("apiKey")`, and the call succeeded. An ID token in a URL leaks into access logs. The provider must read `Authorization: Bearer` from `request` itself and reject when the header is absent (spec §16.2: `/v1` accepts only Bearer).
3. **In emulator mode firebase-admin 14.5.0 always runs the revocation and disabled checks** (`if (checkRevoked || isEmulator)` in `base-auth.js`). Emulator tests cannot tell `checkRevoked=false` from `true`, so the "reads skip checkRevoked" split in §16.2 needs a unit test with a fake verifier and cannot be proven in the emulator.
4. **Emulator mode accepts unsigned (`alg: none`) tokens** for any uid that exists in the emulator. If `FIREBASE_AUTH_EMULATOR_HOST` were ever set outside `local`, tokens could be forged. The env schema must reject that variable when `APP_ENV !== "local"`. This is recorded as follow-up 12.
5. **Error bodies are Mastra's `{ "error": "…" }`, not the `api.md` envelope.** That is acceptable because Mastra is private behind `/v1` (§16.3), but `/v1` must map 401/403 from Mastra and must not pass the body through.
6. **No EE license is needed.** A custom provider works with `NODE_ENV=production` and no `MASTRA_LICENSE_KEY`. The license gates only Studio capabilities (SSO, credentials, `getCurrentUser`) and RBAC/FGA features (`buildCapabilities`, `isEEEnabled`). No license warning was logged.
7. **Membership check needs the tenant.** `authorizeUser(user, request)` has no path params. The tenant has to come from a header or from the request context set by `/v1`, and the same value has to feed `mapUserToResourceId`. Resolving it in `authenticateToken` (as the probe does) keeps the two consistent.

**Conclusion:** PASS. An own provider on `@mastra/core@1.71.0` plus `firebase-admin@14.5.0` validates Auth Emulator tokens and a membership stub with correct 401 and 403 results. Spec §7 and §16.2 hold, with gotchas 1, 2 and 4 as SP3 requirements.

## 2. App Hosting emulator × Next 16.3.7 (spec §14 item 1, local part)

**Source:**
- `firebase-tools@15.32.0`:
  - `lib/emulator/apphosting/serve.js`
  - `lib/emulator/apphosting/developmentServer.js`
  - `lib/init/spawn.js`
- Scratch `firebase.json` (outside the repo):

```json
{ "emulators": { "singleProjectMode": true,
  "apphosting": { "host": "127.0.0.1", "port": 5102,
    "rootDirectory": "C:/Projetos/.contexts/app/apps/web", "startCommand": "pnpm exec next dev" },
  "hub": { "port": 4410 }, "logging": { "port": 4510 }, "ui": { "enabled": false } } }
```

- Command, run from the scratch dir with `app/.env.local` exported: `firebase emulators:exec --only apphosting --project demo-core "node poll.mjs http://127.0.0.1:5102/v1/health"`.

**Evidence:**

```
▲ Next.js 16.3.7 (Turbopack)  - Local: http://localhost:5102   ✓ Ready in 551ms
i  apphosting: connecting apphosting emulator
{"requestId":"01M3QQ6N…","status":200,"message":"health_checked_ok","service":"web","env":"local"}
POLL http://127.0.0.1:5102/v1/health 200 {"data":{"status":"ok"}}
ROOT 200 … 10603 bytes
+ Script exited successfully (code 0)
i  apphosting: Stopping App Hosting Emulator
(after shutdown) curl 127.0.0.1:5102/v1/health -> 200   <- next dev tree left running
```

**Findings:**

- The emulator **only spawns a dev server.** It runs `startCommand` (or an auto-detected `<pm> run dev`) with `shell: true`. It injects:
  - `PORT`;
  - `FIREBASE_APP_HOSTING=1`, `X_GOOGLE_TARGET_PLATFORM=fah`;
  - the emulator host variables;
  - the env from `apphosting.yaml`, `apphosting.emulator.yaml` and `apphosting.local.yaml`.

  It does not build with `@apphosting/adapter-nextjs`, does not run `next start`, and does not proxy. It says **nothing** about production compatibility, which is Task 0's job.
- Auto-detection fails for `apps/web`: it looks for `pnpm-lock.yaml` in `rootDirectory`, and the lockfile lives at the workspace root. `startCommand` is therefore required.
- `pnpm -F web dev` would ignore the injected `PORT` because our `next-dev.ts` uses `WEB_PORT`. It works only with a start command that lets Next read `PORT` (`pnpm exec next dev`), since a `--port` in the start command is rejected.
- For pnpm projects the Firebase JS SDK autoinit is skipped (a warning in the code).
- On Windows the `next dev` tree survived emulator shutdown, the same class of problem as follow-up 8. The orphans were killed by PID tree.

**Conclusion:** It works locally with a custom `startCommand`, but it adds nothing over `pnpm dev` (`next dev`), so `local` keeps `next dev` (spec §14 item 1). **The real App Hosting spike (Task 0) is still BLOCKED.** It needs a sandbox Firebase project (not `demo-*`, not prod) and user authorization for a deploy (plan Task 0 Step 2). It was not attempted.

## 3. `@mastra/evals` peer (E4, spec §14 item 3)

**Commands:** `npm view @mastra/evals version peerDependencies peerDependenciesMeta dist-tags`, then `npm pack` and a scratch `pnpm add @mastra/evals@1.10.3 vitest@5.0.2 @mastra/core@1.71.0 zod@4.6.5`.

**Evidence:**

```
latest 1.10.3, alpha 1.10.4-alpha.0 (2026-09-29)
peerDependencies: { vitest: ">=3.0.0 <5.0.0", @mastra/core: ">=1.0.0-0 <2.0.0-0" }   (same on 1.10.4-alpha.0)
peerDependenciesMeta: { vitest: { optional: true } }
exports: . ./scorers/prebuilt ./scorers/utils ./checks ./vitest ./vitest/setup
vitest imported only by dist/matchers-* (the ./vitest subpath)
pnpm peers check -> ✕ unmet peer vitest  Installed: 5.0.2  Wanted: ">=3.0.0 <5.0.0"
createScorer from "@mastra/core/evals" (no @mastra/evals):
  createScorer({ id, description, type: "agent" }).generateScore(...).run(...) -> score 1
```

**Conclusion:** E4 still holds. The latest version and the alpha both declare `vitest <5`. The peer is optional and only the `./vitest` matchers use it, so the prebuilt scorers would probably load, but pnpm reports an unmet peer, and ADR 0004 keeps the package out. **For SP3:** write our own scorers with `createScorer` from `@mastra/core/evals` (smoke-tested above on 1.71.0) and run them in Vitest 5 without the `@mastra/evals/vitest` matchers. Re-measure at SP3 start and adopt the package only when a release accepts `vitest ^5`.

## 4. FCM and App Check in Tauri (spec §14 item 5)

**Sources:**
- `reports/spike-tauri.md` §"FCM / App Check notes";
- firebase.google.com/docs/app-check (fetched 2026-09-29);
- a web search for Tauri 2 push plugins (GitHub: `yanqianglu/tauri-plugin-mobile-push`, `Choochmeque/tauri-plugin-notifications` and its forks, `tauri-plugin-remote-push`, `mantou132/tauri-plugin-fcm`).

This is desk research only. Nothing was built or run on a device: there is no Android toolchain target and no macOS host (spike-tauri).

**Facts:**
- The official Tauri `notification` plugin is **local notifications only**.
- Remote push exists only in **community** plugins. They mostly cover FCM on Android and APNs on iOS; some also cover macOS and Linux, and Windows is generally unsupported.
- App Check providers:
  - Android: Play Integrity;
  - Apple: App Attest or DeviceCheck;
  - web: reCAPTCHA Enterprise;
  - everything else: a **custom provider** backed by your own attestation service;
  - every platform: a debug provider for dev and CI.
- The JS SDK in a Tauri webview only has web providers (reCAPTCHA), which expect a real web origin, not `tauri://localhost` or `http://tauri.localhost`.

**Options:**

| Platform | Push | App Check |
|---|---|---|
| Android | Community plugin (FCM) or our own Kotlin mobile plugin (`FirebaseMessagingService`) exposed as a Tauri command | Native Play Integrity through our own plugin, token handed to JS or `/v1` |
| iOS | Community plugin (APNs, optionally via FCM) or our own Swift plugin | App Attest through our own plugin |
| Desktop (Win/macOS/Linux) | No FCM. Use in-app realtime (Firestore listener or SSE) plus local notifications from the official plugin | No attestation. Rely on Firebase Auth, rate limits and the device grant (§16.2); do not enforce App Check for desktop clients |

**Recommendation:**
- v1 desktop ships **without remote push or App Check**. Use in-app realtime plus local notifications, and have `/v1` accept requests from desktop without an App Check token.
- For mobile (SP2 or later), prototype with a community plugin, but plan our **own thin mobile plugin**: community plugins are young and single-maintainer, and push and attestation are security-sensitive.
- Server-side App Check verification (`firebase-admin` `getAppCheck().verifyToken`) should be optional per client type.

**Status:** OPEN (unverified on device). It needs Android targets and a sandbox project with FCM.

## 5. Version gaps (report only; no pins changed)

**Commands:**
- `npm view <pkg> version` for every entry in the `catalog:` and `catalogs.node24` blocks of `app/pnpm-workspace.yaml`;
- the crates.io API for `tauri` and `tauri-build`;
- a comparison with the `.contexts/engineering/MEMORY.md` baseline table.

**Evidence:** 36 of the 39 catalog entries (38 in `catalog:`, 1 in `catalogs.node24`) equal npm `latest` on 2026-09-29. The crates `tauri 2.12.0` and `tauri-build 2.7.0` equal the max stable versions. The differences:

| Package | Pinned | Latest | Why |
|---|---|---|---|
| eslint | 9.39.5 | 10.11.0 | E3: `eslint-plugin-react@7.37.5` still peers `^9.7` (re-measured). That plugin is not installed in `app/` yet, so E3 is anticipatory until SP2 adds React lint. |
| @eslint/js | 9.39.5 | 10.0.1 | Follows E3 |
| @types/node (`catalogs.node24`) | 24.19.0 | 26.6.3 | By design: web and Functions run on Node 24 (E1, §16.3). 24.19.0 is the newest 24.x. |

`typescript-eslint@8.71.0` still peers `typescript >=4.8.4 <6.1.0`, so E2 holds.

**Drift against the `MEMORY.md` baseline** (the framework is read-only, so these are reported only):
- **Next:** MEMORY says 16.3.6 ("16.3.7 announced for 2026-09-30"), but `app/` pins **16.3.7**, the security release already published and adopted per spec §16.1.
- **`ai`:** MEMORY says 7.0.120, npm latest is 7.0.122 (spec §16.1). It is not installed in SP0.
- **`@mastra/auth-firebase`:** still 1.1.2 with `firebase-admin ^13.7.0`, so §16.2 (not adopted) holds.

## 6. SP0 summary

### What was built (per task, main commits)

| Task | What | Commits |
|---|---|---|
| 0 | App Hosting production spike | **BLOCKED**: needs a sandbox Firebase project and deploy authorization |
| 1–2 | pnpm 12 + turbo workspace; shared tsconfig, ESLint boundaries, Vitest preset | `0e508b1`, `8061eba`, review `abd1602` |
| 3–4 | `@core/contracts`: primitives, catalog meta registry, `contracts:catalog/check` | `a507dcf`, `c16c76d`, review `8aaf9bd` |
| 5 | Firebase Emulator Suite, deny-by-default rules | `4256cdc` |
| 6 | Local Postgres 18 + pgvector 0.8.6, typed env | `682c809` |
| 7 | `@core/services` logger and route boundary; Next 16.3.7 web with `/v1/health` | `85489c7`, `2e64cb0`, `0158bd1`, review `1f97f69`, `f718243` |
| 8 | Mastra server with Postgres storage (`spike-mastra.md`) | `f3ba6b3`, `c51d5f3`, `ce7fea7`, review `d5a78ee`, `745bcd2` |
| 9 | Gen2 Functions on nodejs24 | `4d25e1b`, review `b870e3b` |
| 10 | CORS allowlist on `/v1`; Tauri 2 + Vite desktop shell (`spike-tauri.md`) | `636f766`, `fc07bfb`, review `bfbd6b3`, `1f87981` |
| 11 | `pnpm dev` orchestration, local seed, CI, docs; cleanup items 1–4 | `83c8df5`, `30ab2ad`, `0bb5791`, `cc1710b`, `8488a12`, `8dfb31b`, `297acd2`, `4215de3` |
| 12 | Spikes 1–5 above (this report) | this `docs(workspace)` commit |

### Gate against spec §13 (SP0)

Fresh run on 2026-09-29 in `app/`. The working tree contained uncommitted edits from a concurrent Task 11 review (`app/scripts/src/dev/*`, `apps/web/scripts/web-port.ts`, `.github/workflows/app-ci.yml`), so these results cover HEAD plus those edits.

| Gate | Result |
|---|---|
| `pnpm lint` | exit 0, 8/8 tasks |
| `pnpm typecheck` | exit 0, 8/8 tasks |
| `pnpm turbo run test --force` | exit 0, 0 cached, 240 tests passed: scripts 43, web 25, contracts 53, functions 22, config 2, services 59, desktop 22, mastra 14 |
| `pnpm contracts:check` | exit 0 |
| `pnpm dev` starts empty | Not re-run here. Evidence is in `task-11.md` (three runs, "everything is up"). |
| Spikes reported | §14 items 3 and 4: PASS. Item 1: local part done, production BLOCKED (Task 0). Item 5: OPEN (desk research only). Item 2: covered by the Task 7–10 reports. Item 6 (Observational Memory) belongs to SP3. |

### Deviations and local decisions

- Local ADRs in `app/docs/decisions/`:
  - `0001` OpenAPI is generated with native `z.toJSONSchema`;
  - `0002` the process log context lives on `globalThis`;
  - `0003` `GET /v1/health` is a public liveness endpoint;
  - `0004` Functions config lives in committed `.env.<projectId>` files;
  - `0005` field `pii` is authoritative and contract `pii` is a summary.
- Commit scopes use `workspace`, `web`, `mastra` and similar instead of the plan's `app`, because the commits rule forbids `app`. Task 11's single `ci(app)` commit was split by concern. This commit uses `docs(workspace)` instead of the plan's `docs(app)` for the same reason.
- Exceptions in force: E1 (Functions and web on Node 24 types), E2, E3, E4. The Next 16.3.7 `minimumReleaseAgeExclude` entries must be removed after 2026-10-07.

### Follow-ups and blocked items

- **Follow-ups:** `../follow-ups.md`, items 1–11 plus 12–15 added by this task.
- **Blocked:** Task 0 (App Hosting production spike). It needs a sandbox Firebase project and explicit user authorization to deploy, and the fallback in §16.3 applies if it fails.
