# 0010. Dependency audit advisories (2026-09-29): accept two unreachable moderates

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/pnpm-lock.yaml` (transitive dependencies of `firebase-tools` and `firebase-admin`); local decision
  of the boilerplate, the framework in `.contexts/` is unchanged
- **Closes:** SP0 follow-up #10 (`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`)
- **Re-check:** 2026-12-29, or earlier on any bump of `firebase-tools`, `firebase-admin` or `firebase-functions`

## Context

`rules/security.md` §9 asks for dependency scanning and a decision on every advisory. CI fails on `high` or worse
(`pnpm audit --audit-level high`). On 2026-09-29, `pnpm audit --json` (pnpm 12.6.0, 1359 dependencies) reported
0 critical, 0 high, 2 moderate, 0 low:

| Advisory | Package | Installed | Patched | Paths |
|---|---|---|---|---|
| GHSA-w5hq-g745-h8pq — missing buffer bounds check in v3/v5/v6 when `buf` is provided | `uuid` | 9.0.1 | ≥ 11.1.1 | `firebase-tools > gaxios`, `firebase-tools > google-auth-library > (gcp-metadata \| gtoken) > gaxios`; `apps/functions > firebase-admin > @google-cloud/storage > gaxios` and `... > google-auth-library > ... > gaxios` (also through `firebase-functions > firebase-admin`) |
| GHSA-8988-4f7v-96qf — unbounded memory allocation in W3C Baggage propagation | `@opentelemetry/core` | 1.30.1 | ≥ 2.8.0 | `firebase-tools > @google-cloud/pubsub > @opentelemetry/core` |

## Reachability

- **`uuid`.** Only `gaxios@6.7.1` resolves `uuid@9.0.1` (`pnpm why -r uuid`). Its single use is
  `(0, uuid_1.v4)()` to build a multipart boundary (`gaxios/build/src/gaxios.js`). The advisory needs `v3`, `v5` or
  `v6` called with a caller-supplied `buf`; `v4()` without arguments is not affected. Our code does not import
  `uuid` (Postgres generates `uuidv7()`, Firestore uses automatic ids, events use `ulid`). Not reachable.
- **`@opentelemetry/core` 1.x.** Only `firebase-tools` (dev dependency: CLI and local emulators) pulls it, through
  its Pub/Sub client. It never ships to App Hosting, Cloud Run or Functions, and the emulators listen on localhost
  with trusted inputs. No other package in the lockfile resolves `@opentelemetry/core`. Not reachable in any
  deployed artifact.

## Decision

1. **Accept both** advisories with the re-check date above. No `pnpm.overrides`: the fix for `uuid` is a major
   jump (9 → 11) under libraries that pin `^9`, and forcing it risks a runtime break for no reachable benefit; the
   `@opentelemetry/core` fix is a major (1 → 2) inside a dev-only CLI.
2. Upgrade instead of override when upstream ships the fix (`gaxios` 7+ no longer depends on `uuid`;
   `@google-cloud/pubsub` moves to OTel 2.x): bump the catalog pin of the direct dependency (`firebase-tools`,
   `firebase-admin`) and re-run the audit.
3. Any new advisory at `high` or above fails CI and needs its own decision (upgrade, override when reachable, or a
   new accept entry here via a superseding decision).

## Consequences

- `pnpm audit` keeps printing 2 moderates until upstream moves; `pnpm audit --audit-level high` exits 0.
- The re-check is a calendar item for whoever owns dependency updates; follow-up #10 is closed.

## Alternatives rejected

- **`pnpm.overrides` to `uuid@11` / `@opentelemetry/core@2`.** Major overrides under unmodified callers, for
  advisories we cannot reach.
- **Ignore list in CI (`--ignore`).** Hides new findings in the same packages; the audit level already filters
  moderates.
