# @core/functions

Firebase Functions Gen 2 codebase (`nodejs24`, ADR 0004 E1) for events, jobs and
webhooks: `healthz` (public liveness probe) and `onFileFinalized` (SP3 Task 13: magic-byte
and size validation of uploads under `tenants/{tenantId}/files/{fileId}`, decision 0019
amendment). `FILES_BUCKET` in `.env.<projectId>` selects the bucket (unset = default
bucket, which must be in or cover `southamerica-east1`).

## When to use

Add triggers in `src/index.ts` (the composition root). Functions are private by
default (`setGlobalOptions({ invoker: "private" })`); env is validated in
`src/functions-env.schema.ts`, and non-secret per-project config lives in
`.env.<projectId>` (decision 0004).

## How to run

The emulator loads the bundle in `lib/`, so build first. `pnpm dev` (from `app/`)
builds once and keeps an esbuild watch running. Alone:

```bash
pnpm -F functions build      # node build.ts: lib/index.js + deploy package.json
pnpm -F functions dev        # esbuild watch, rebuilds lib/index.js in place
pnpm exec firebase emulators:start --only functions --project demo-core   # from app/
curl -i http://127.0.0.1:5001/demo-core/southamerica-east1/healthz
```

## How to test

```bash
pnpm -F functions test       # unit
pnpm test:emulators          # from app/: builds, then runs *.emulator.test.ts in the emulators
```

## References

- `build.ts` (why `lib/` is the deploy source), `../../docs/decisions/0004-functions-env-files.md`
- `.contexts/engineering/stacks/backend/firebase-functions.md`
