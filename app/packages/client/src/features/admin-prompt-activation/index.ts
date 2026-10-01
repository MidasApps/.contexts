// Public API of the admin-prompt-activation feature (SP5 Task 12): eval run, eval-gated activation, forced activation and rollback.
export { useRunPromptEval, type PromptEvalOutcome, type RunPromptEval } from "./model/use-run-prompt-eval.ts";
export { canActivatePrompt, isPromptRollback, PromptActivationDialog, type PromptActivationDialogProps, type PromptActivationRequest } from "./ui/PromptActivationDialog.tsx";
export { PromptEvalResultTable } from "./ui/PromptEvalResultTable.tsx";
