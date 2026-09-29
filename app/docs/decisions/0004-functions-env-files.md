# 0004. Functions config lives in committed `.env.<projectId>` files

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/apps/functions` (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Deviates from:** the workspace rule "only `.env.example` is versioned" (`app/.gitignore`, `contracts/secrets.md` §13), for non-secret Functions config only

## Context

Functions read their env through `src/env.ts` (Zod, `contracts/secrets.md` §5.4). Unlike web and Mastra, a deployed function has no `.env.local` and no container env to set by hand: the Firebase CLI loads `.env`, `.env.<projectId or alias>` and, in the emulator only, `.env.local` from the functions config directory (`firebase.json` `configDir`, here `apps/functions`). It uploads those values as plain runtime env. Firebase also reserves the `FIREBASE_` prefix in these files, so the workspace `app/.env.local` cannot be reused.

Firebase's documented pattern is to commit `.env.<projectId>` files with non-secret, per-project config, and to keep secrets in Secret Manager.

## Decision

- `apps/functions/.env.<projectId>` files are **committed** and hold **non-secret** config only, today just `APP_ENV`.
- `apps/functions/.env.demo-core` (`APP_ENV=local`) is the local file. It is used by the emulator for the `demo-*` project, which can never reach real services. `app/.gitignore` whitelists exactly this file.
- Each remote project gets its own file (for example `.env.<staging-project-id>` with `APP_ENV=staging`) when that environment is created. Each file needs its own explicit `.gitignore` exception, added in review.
- **Secrets never go in these files.** They go to Secret Manager through `defineSecret` and are bound per function with `secrets: [...]` (`contracts/secrets.md` §5.1). `.env.local` stays gitignored for a developer's private emulator overrides.
- Every variable read is still declared in `src/functions-env.schema.ts`, and the boot fails when one is missing.

## Alternatives rejected

- **Generate the files at build time from CI variables.** It adds a moving part for values that are not secret and that Firebase already versions per project.
- **Put the values in `defineString` params with defaults.** Params read the same files, and defaults would hide a missing per-project value instead of failing the boot.
- **Keep the files gitignored.** A fresh clone and CI could not start the emulator, and deployed config would live only on someone's disk.

## Consequences

- Reviewers check every `.env.*` diff in `apps/functions` for secret-looking values (`contracts/secrets.md` §16). The secret-scanning pre-commit and CI checks cover these files like any other.
- Adding an environment means adding one small file and one `.gitignore` line.
