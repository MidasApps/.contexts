// Public API of the message entity (SP4 Task 9): chat message parts → components, and the
// readers the chat features use on the same parts.
export { linkCitationMarkers, type LinkedCitations } from "./lib/citation-markers.ts";
export {
  approvalRequestOf,
  attachmentsOf,
  collectSources,
  delegationOf,
  generativeUiOf,
  isLowConfidence,
  partsOf,
  pendingApprovalOf,
  textOf,
  toolPartOf,
  toolPreviewOf,
  tripwireOf,
  type ApprovalRequestView,
  type AttachmentView,
  type DelegationStep,
  type DelegationView,
  type GenerativeUiView,
  type LoosePart,
  type SourceView,
  type ToolApprovalView,
  type ToolPartView,
  type ToolPreviewView,
  type TripwireView,
} from "./lib/part-guards.ts";
export { formatUiSubmission, parseUiSubmission, type ChoiceSubmission, type FormSubmission, type UiSubmission } from "./lib/ui-submission.ts";
export { ChatMessage, type ChatMessageProps } from "./ui/chat-message.tsx";
export { MessageParts, type MessagePartsProps, type RenderToolPart, type ToolPartContext } from "./ui/message-parts.tsx";
