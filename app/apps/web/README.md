# @core/web

Next.js 16 app: routing and the public `/v1` HTTP API. Route files only re-export
driving adapters from `@core/services`; there is no business logic here.

## When to use

Add pages (App Router) and `/v1` routes that expose service use cases. Security
headers live in `src/config/security-headers.ts`, request ids and `/v1` CORS in
`src/proxy.ts`, and the env schema in `src/web-env.schema.ts`.

## How to run

From `app/`, `pnpm dev` starts it with the rest of the stack. Alone:

```bash
pnpm -F web dev              # next dev on WEB_PORT (default 3000), reads app/.env.local
pnpm -F web build && pnpm -F web start -p 3100
curl -si localhost:3000/v1/health   # 200 {"data":{"status":"ok"}}
```

## How to test

```bash
pnpm -F web test
pnpm -F web lint
pnpm -F web typecheck        # next typegen + tsc
```

## References

- `../../docs/decisions/0002-process-log-context-on-globalthis.md`, `0003-public-liveness-endpoint.md`
- `.contexts/engineering/stacks/frontend/next@16.md`, `.contexts/engineering/contracts/api.md`
