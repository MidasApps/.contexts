# 0080. Framework changes travel alone

- **Status:** accepted
- **Date:** 2026-11-13
- **Scope:** `.github/workflows/app-ci.yml` (job `framework-guard`), `app/README.md` (local decision; the framework is unchanged)

## Context

`.contexts/` and `.claude/` are the DDC framework, and the app only follows them. The
`framework-guard` job failed every pull request, and every push to `main`, that touched either
folder. The framework still has to change: its version pins (`.contexts/engineering/MEMORY.md`,
`stacks/VERSIONS.md`, the stack files and the skills that quote them) fell behind the catalog when
decision 0071 moved the app to Next.js 16.4, Zod 4.6.7 and Vite 8.3.8. There was no way to land
that change with CI green.

## Decision

1. **A framework change is a pull request of its own.** It touches `.contexts/` and `.claude/`
   and nothing else.
2. **The guard fails a mixed change.** It still diffs against the pull request base, or the
   previous tip on a push. When `.contexts/` or `.claude/` changed together with any other path,
   it fails and lists the files. When only they changed, it passes. When neither changed, nothing
   happens, as before.
3. **The job is renamed** "framework changes travel alone", since the framework is no longer
   read-only.

## Consequences

- App changes keep the old guarantee: an app pull request that edits the framework fails.
- A framework pull request runs the whole app pipeline. The app does not read the framework, so
  the other jobs pass unchanged.
- A squash merge keeps the pull request's diff, so the push to `main` passes the same check.
- The root `CLAUDE.md` is outside both folders, so a change to it is not a framework-only change.

## Alternatives rejected

- **Merge framework changes with the guard red.** `main` has no branch protection, so it would
  work, but a red check on every framework change teaches people to ignore it.
- **A label or a commit marker that skips the guard.** One more thing to remember. It would also
  let a mixed change through.
- **Edit the framework only in an upstream repository.** The framework is maintained in this
  repository.
