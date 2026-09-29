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
- 2026-09-29 | SP0a Task 2 complete | plan: docs/plans/2026-09-29-sp0a-core-doctrine.md | commits: 86563a6..c141338 | review: Spec PASS; Quality fixes verified by controller
- 2026-09-29 | SP0a Task 3 complete | plan: docs/plans/2026-09-29-sp0a-core-doctrine.md | commits: 96b20dd..3f97811 | review: Spec PASS; Quality fixes verified by controller
- 2026-09-29 | SP0a Task 4 complete | plan: docs/plans/2026-09-29-sp0a-core-doctrine.md | commits: da878f1..3c5216c | review: Spec PASS; Quality fixes verified by controller; human ratified E6 provisional + App Hosting spike as SP0b Task 0
- 2026-09-29 | SP0a Task 5 complete | plan: docs/plans/2026-09-29-sp0a-core-doctrine.md | commits: 098d1fd..32d7966 | review: Spec PASS; security fixes verified by controller; human decided API-key re-intersection, Bearer-only /v1, checkRevoked on mutations+Mastra
- 2026-09-29 | SP0a Task 6 complete | plan: docs/plans/2026-09-29-sp0a-core-doctrine.md | commits: 0efb781..a4f27e3 | review: Spec PASS; fixes verified by controller; human ratified BigQuery AI SQL fail-closed until SP3 and personal PII in-tenant with readPermission
