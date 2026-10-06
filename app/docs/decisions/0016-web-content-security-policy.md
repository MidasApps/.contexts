# 0016. Web Content Security Policy (nonce or documented fallback) and Firebase origins

- **Status:** accepted — static fallback (§2), per the SP2 Task 18 evidence below
- **Date:** 2026-09-29
- **Scope:** `app/apps/web` (`src/proxy.ts`, `src/http/create-proxy.ts`, `src/config/security-headers.ts`) (local decision; the framework is unchanged)
- **Refines:** SP2 spec §10; `.contexts/engineering/rules/security.md` §6

## Context

`rules/security.md` §6 requires a CSP, either static in `next.config.ts` or per-request with a nonce in `proxy.ts` (Next 16), and allows `unsafe-inline`/`unsafe-eval` only with a nonce and a recorded justification. SP0 ships static security headers. SP2 adds pages that load the Firebase JS SDK (calls to `identitytoolkit.googleapis.com` and `securetoken.googleapis.com`, and the Auth Emulator in `local`) and pages that hydrate React. A per-request nonce makes the HTML request-dependent, which may conflict with static rendering under Cache Components.

## Decision

1. **Preferred: nonce-based CSP set in `proxy.ts`** for HTML responses, one nonce per request:
   `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'nonce-<n>'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com [+ Auth Emulator origin when APP_ENV=local]; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
   The nonce reaches Next through the request header it reads (`x-nonce` / CSP header), so framework scripts carry it. The other static headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, …) stay in `src/config/security-headers.ts`.
2. **Fallback:** if Next 16.3.7 cannot combine nonces with Cache Components for these routes (build refuses, or pages cannot render), keep SP0's static CSP extended with the Firebase origins above and without `unsafe-eval`; `style-src` may need `'unsafe-inline'` for Radix/sonner inline styles, which is then justified here.
3. **Verification (Task 18):** `pnpm -F @core/web build`, then a request to `/pt-BR/sign-in` checking the CSP header, a nonce that differs per request, and a page that hydrates without CSP violations in the console. The result, with evidence, turns this decision into `accepted` with the chosen variant.
4. `/v1` responses are JSON and keep the SP0 headers; the CSP applies to page routes.

## Consequences

- With nonces, every page response is dynamic at the edge; static shells are still cached by Next where it supports nonce propagation.
- The Auth Emulator origin is allowed only when `APP_ENV=local`, derived from validated env, never from the request.
- Adding a new third-party origin (analytics, fonts) requires amending this decision.

## Alternatives rejected

- **No CSP until SP deploy.** Violates `rules/security.md` §6.
- **`'unsafe-inline'` scripts.** Defeats the main XSS protection; not needed with nonces or hashed framework scripts.
- **Hash-based CSP.** Next's inline bootstrap scripts change per build and per page; hashes are impractical to maintain.

## Outcome of SP2 Task 18 (2026-09-30): static fallback

- **Evidence.** With the nonce variant, `pnpm -F @core/web build` succeeded and `GET /pt-BR/sign-in` carried a fresh nonce per request, but the HTML is a Cache Components static shell (`x-nextjs-postponed: 1`) prerendered at build time: of its 30 `<script>` tags only the 11 in the request-time part carried the nonce; the 18 framework chunk tags and the inline `$RT` bootstrap of the shell did not. Chromium (Playwright) blocked all of them (`'strict-dynamic'` disables `'self'`) and the page did not hydrate. Next's CSP guide states the same: nonces need dynamic rendering and "Partial Prerendering is incompatible with nonce-based CSP".
- **Chosen variant.** `src/proxy.ts` sets `cspMode: "static"`: `script-src 'self' 'unsafe-inline'` (the inline bootstrap scripts of the static shell change per build and page, see *Alternatives*), `style-src 'self' 'unsafe-inline'` (Radix/sonner inline `style` attributes, which no nonce can cover), `connect-src 'self'` + the two Firebase Auth origins + the Auth Emulator origin only when `APP_ENV=local` (from validated env, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL`), no `'unsafe-eval'` outside `next dev`. The rest of §1 is unchanged. Verified: sign-in, organizations, project, module, profile and settings pages hydrate with no CSP violation in the console.
- **Where it is set.** The proxy sets the CSP per request (it needs the validated env); `/v1` JSON responses get `default-src 'none'; frame-ancestors 'none'`; `next.config.ts` keeps only the other static headers (`src/config/security-headers.ts`).
- **Kept for later.** `createProxy` still implements the nonce variant (`cspMode: "nonce"`, covered by tests: nonce per request, forwarded as `x-nonce` and in the request CSP header) and `createClientApp` accepts `themeNonce`. Revisit when Next can nonce a prerendered shell or when the app stops prerendering shells; experimental SRI (`experimental.sri`) is the other candidate.
