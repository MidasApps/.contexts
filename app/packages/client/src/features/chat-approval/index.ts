// Public API of the chat-approval feature (SP4 Task 10, decision 0032 path A): inline approval
// of mutation tools through the native AI SDK approval response.
export { type ApprovalDecision, type ToolApproval, useToolApproval } from "./model/use-tool-approval.ts";
export { ToolConfirmation, type ToolConfirmationProps } from "./ui/tool-confirmation.tsx";
