// Public API of the approval-decision feature (SP5 Task 14): approve or reject a pending request.
export { DECISION_ERROR_CODES, decisionErrorCodeOf, useApprovalDecision, type ApprovalDecisionState, type DecisionVerb } from "./model/use-approval-decision.ts";
export { ApprovalDecision, type ApprovalDecisionProps } from "./ui/ApprovalDecision.tsx";
