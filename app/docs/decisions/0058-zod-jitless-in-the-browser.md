# 0058. Zod runs jitless in the web and desktop bundles

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/apps/web` (`src/app/[locale]/layout.tsx`), `app/apps/desktop` (`index.html`, `public/zod-jitless.js`) (local decision; the framework is unchanged)
- **Refines:** decision 0016 (web CSP); `.contexts/engineering/rules/security.md`

## Context

Zod 4 compiles a fast path for object schemas with `new Function`. To know whether it may, it
probes `new Function("")` once, when the first object schema is built (`util.allowsEval`), and
catches the error. The web CSP (decision 0016) and the Tauri webview CSP have no `'unsafe-eval'`,
so the probe is blocked. The page keeps working, but the browser still reports a CSP violation:
Firefox logs it as a console error. The final e2e run caught it in the console guard of
`a11y.spec.ts` (the support access banner journey), with the error pointing at Zod's chunk.

`z.config({ jitless: true })` skips the probe, but it must run before the first object schema is
built, and every bundle builds schemas at import time (`@core/contracts`). Zod keeps its config on
`globalThis.__zod_globalConfig`, so a script that sets it before the bundle covers every schema.

## Decision

1. **Web:** the root layout renders a `next/script` with `strategy="beforeInteractive"` that sets
   `globalThis.__zod_globalConfig.jitless = true`. Next runs it before any app code. The server
   is unchanged (no CSP applies there, and the fast path stays on).
2. **Desktop:** `index.html` loads `public/zod-jitless.js` as a classic script before the module
   bundle (allowed by `script-src 'self'`). `src/zod-jitless.test.ts` checks the order and the
   effect.
3. The CSP is not relaxed: `'unsafe-eval'` stays out of every production policy.

## Consequences

- Browser parsing uses Zod's interpreted path. The schemas parsed in the client are small (API
  answers, forms), so the cost does not show.
- A new browser entry point (another app or a worker bundle) must set the same flag first.

## Alternatives rejected

- **`'unsafe-eval'` in `script-src`.** Weakens the main XSS protection to silence a probe.
- **`z.config({ jitless: true })` in a client module.** Import order decides whether it runs
  before the first schema, and `@core/client` declares no side effects (`sideEffects`), so a
  bundler may drop a side-effect-only import.
- **Allowing the error in the console guard.** It is a real CSP report; with CSP reporting on,
  every page load would send one.
