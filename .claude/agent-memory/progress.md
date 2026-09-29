# Progress ledger (SDD / multi-task plans)

Append-only. Survives conversation compaction. Controllers and SessionStart may
read the **tail** of this file.

## Format

```text
- YYYY-MM-DD | Task N complete | plan: docs/plans/<file>.md | commits: <base>..<head> | review: clean
- YYYY-MM-DD | Task N blocked | plan: ... | reason: ...
```

## Rules

1. Mark complete only after task-reviewer **Spec PASS** + **Quality APPROVED** (or human override).
2. After compact/resume: trust this ledger + `git log` over chat memory — do not re-dispatch completed tasks.
3. Keep entries one line each; details live in plan/report files.

## Entries

<!-- append below -->

- 2026-09-29 | SP0a Task 1 complete | plan: docs/plans/2026-09-29-sp0a-core-doctrine.md | commits: bdece6f..36d55a4 + fixup | review: Spec PASS; Quality CHANGES_REQUIRED fixed (stale pins, invariant 8 caveat)
