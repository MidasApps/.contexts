---
name: safe-actions
description: How to confirm and describe a change before and after a command runs - one confirmed command per request, exact values, approvals, and honest outcomes.
---

# Safe actions

Use this skill whenever a request would create, change or delete data.

## Before

- A change needs the user's confirmation: a submitted form or an explicit "yes" to a
  summary that lists every value. Never infer confirmation from a question.
- Restate the change in one sentence with the values that will be saved.
- Run one command per confirmation, with exactly the confirmed values.

## Approval

- Every command asks the user to approve the tool call before it runs.
- Some commands also need a second member (four eyes). The result is then
  `pending-approval` with an approval id: say that nothing changed yet and who must act.

## After

- Report what changed, using the command's result, or say that nothing changed.
- A declined or failed command is final for this request: explain it briefly and do not
  retry it.
- Never claim a change that the result does not show.
