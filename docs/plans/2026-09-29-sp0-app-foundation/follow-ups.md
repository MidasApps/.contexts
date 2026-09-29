# SP0 follow-ups

These are open items found during SP0 that are deliberately left for later. Each entry names its source and the subproject that owns it. The SP0 summary (Task 12) and SP3 planning read this list.

| # | Item | Why it matters | Owner | Source |
|---|---|---|---|---|
| 1 | **PostgresStore auto-init in remote environments.** Use `disableInit: true` at runtime, add an explicit `storage.init()` migration step in deploy under a DDL-capable role, and give the runtime a least-privilege role (DML only on schema `mastra`). | At boot, `PostgresStore` creates and alters 43 `mastra_*` tables, so the runtime user needs DDL today. | SP3 | Task 8 (`reports/spike-mastra.md`) |
| 2 | **`mastra build` runs a nested `pnpm install`** in `.mastra/output`. It resolves the exact versions the deployer writes, so our lockfile is bypassed, and it needs registry access during the image build. Options: vendor from the workspace store, pin with an output lockfile, or build with network policy plus audit. | This is a supply-chain and reproducibility gap in the Mastra image. | SP3 / deploy | Task 8 |
| 3 | **Cloud SQL socket DSN is rejected** by the `DATABASE_URL` check in `ServicesEnvSchema`. That check is `z.url` with protocol `postgres(ql)`, so it fails for a host-less socket form such as `postgresql://user@/db?host=/cloudsql/...`. Support the socket form or the Cloud SQL connector config explicitly. | Cloud Run with Cloud SQL uses the unix socket or the connector (spec §16.3). | SP3 | Task 8 review |
