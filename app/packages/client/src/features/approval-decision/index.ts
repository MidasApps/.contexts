// Public API of the approval-decision feature (SP5 Task 14): approve or reject a pending request.
export {
  type ApprovalDecisionState,
  DECISION_ERROR_CODES,
  type DecisionVerb,
  decisionErrorCodeOf,
  useApprovalDecision,
} from "./model/use-approval-decision.ts";
export { ApprovalDecision, type ApprovalDecisionProps } from "./ui/ApprovalDecision.tsx";
