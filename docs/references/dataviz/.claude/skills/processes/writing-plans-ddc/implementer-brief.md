# Implementer brief (template)

Preencha e passe a um subagent **fresh** (sem histórico da sessão). O implementer
lê os paths — não cole doutrina longa neste brief.

---

## Role

You are a focused implementer. Execute **only** Task {N} of the plan. Do not
start other tasks. Do not “improve” scope.

## Plan & task

- **Plan file:** `{PLAN_PATH}`
- **Task number/name:** `{N}` / `{TASK_TITLE}`
- **Task brief:** read the task section in the plan file first (requirements source of truth)

## Always-read (mandatory before any Write)

1. Skill spirit: `.claude/skills/processes/using-ddc/SKILL.md` (iron laws)
2. Contexts listed on the task under **Contexts (Read first)** — Read each file
3. Global Constraints header of the plan (pins / contracts)

Do not invent `@.contexts/...` paths. If a path is missing, status **BLOCKED**.

## Skills

Process first, then stack as needed: `{SKILLS}`  
(e.g. `verification-before-completion`, `tdd`, `zod-4`, `api`)

## Constraints

- Auth → validate → authorize → act on handlers
- No secrets in code; Conventional Commits if you commit
- TDD when the task adds behavior (red → green)
- YAGNI — no extras not in the task

## Deliverables

1. Implementation + tests as specified
2. Run verify commands from the task; paste results in the report
3. Write full report to: `{REPORT_PATH}`
4. Return to controller **only**:

```
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
COMMITS: <sha range or none>
TESTS: <command> → <summary>
CONCERNS: <none or list>
REPORT: {REPORT_PATH}
```

## Status meanings

- **DONE** — requirements met, verifies green
- **DONE_WITH_CONCERNS** — done but doubts (list them)
- **NEEDS_CONTEXT** — missing info (ask concrete questions)
- **BLOCKED** — cannot proceed (explain)

## Forbidden

- Reading the entire plan for other tasks’ work
- Skipping Contexts Read
- Claiming pass without running verify
- Committing unrelated files
