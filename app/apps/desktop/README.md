# @core/desktop

Tauri 2 desktop shell with Vite, React 19 and TanStack Router. It calls the web
`/v1` API; SP0 shows only the API health.

## When to use

Add routes in `src/routes/`. `VITE_API_URL` (validated in `src/env.ts`) is the
web origin; the Tauri CSP `connect-src` is derived from it by
`scripts/write-tauri-api-config.ts`. Change `identifier` in
`src-tauri/tauri.conf.json` before shipping a derived app.

## How to run

Needs Rust through rustup (`src-tauri/rust-toolchain.toml` pins 1.98.1) and the
web app running (`pnpm dev` from `app/`). The first Rust build takes minutes.

```bash
pnpm dev:desktop             # from app/; same as pnpm -F desktop tauri:dev (window + Vite on 1420)
pnpm -F desktop dev          # Vite only, in the browser at http://localhost:1420
VITE_API_URL=https://api.example.com pnpm -F desktop tauri:build   # release build
```

`.env.development` points at `http://localhost:3000`; set `VITE_API_URL` (for
example `http://localhost:3100`) when web runs on another `WEB_PORT`.

## How to test

```bash
pnpm -F desktop test
pnpm -F desktop lint
pnpm -F desktop typecheck
```

## References

- `../../../docs/plans/2026-09-29-sp0-app-foundation/reports/spike-tauri.md`
