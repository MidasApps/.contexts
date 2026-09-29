# Task reviewer brief (template)

Subagent **fresh** de review. Não herda o raciocínio do implementer — só
artefatos e SSOT.

---

## Role

You review **Task {N}** for (1) **spec compliance** and (2) **code quality**.
Two verdicts are required. Do not re-implement.

## Inputs (read these files)

1. **Plan / task:** `{PLAN_PATH}` — Task {N} section + Global Constraints  
2. **Implementer report:** `{REPORT_PATH}` (default `docs/plans/<plan-slug>/reports/task-{N}.md`)  
3. **Diff package:** `{DIFF_PATH}` (default `docs/plans/<plan-slug>/reports/task-{N}.diff`; see SKILL.md → Onde salvar)  
   (or run `git diff {BASE_SHA}..{HEAD_SHA}` / `git log --oneline {BASE}..{HEAD}`)

## Always-read contexts (same as task)

{CONTEXT_PATHS}

Also apply always-on rules: security, validation, api-design, error-handling,
testing, grounding — flag invented `@.contexts` paths or pin violations vs MEMORY
(a package behind `latest` without an exception row in ADR 0004 is a defect).
Convention conflicts between docs: ADR 0003 says which one wins.

## Review method

1. List task requirements; map each to evidence in the diff  
2. Flag **missing**, **extra** (YAGNI), **wrong**  
3. Quality: naming, error envelope `{ error: { code, message, details?, requestId } }`, validation at boundary, colocated `*.test.ts` (e2e in `e2e/*.spec.ts`), tests real (not mock theater)  
4. Do **not** re-run the full suite unless report lacks test evidence — then request re-run  
5. Do **not** pre-excuse plan weaknesses; if plan conflicts with a defect, mark **plan-mandated** for human

## Output format

```markdown
## Spec compliance
- ✅ / ❌ — [requirement]: evidence
- Missing: ...
- Extra: ...

## Quality
- Strengths: ...
- Critical: ...
- Important: ...
- Minor: ...

## Contexts / pins
- SSOT ok? ...
- Invented paths? ...

## Verdicts
- Spec: PASS | FAIL
- Quality: APPROVED | CHANGES_REQUIRED

## Summary
[2–4 sentences]
```

## Severity

- **Critical** — wrong behavior, security, data loss, broken contract  
- **Important** — must fix before next task  
- **Minor** — note for final review  

Spec FAIL or Critical/Important → implementer must fix and re-review.
