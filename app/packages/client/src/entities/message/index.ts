// Public API of the message entity (SP4 Task 9): chat message parts → components, and the
// readers the chat features use on the same parts.
export { type LinkedCitations, linkCitationMarkers } from "./lib/citation-markers.ts";
export {
  type ApprovalRequestView,
  type AttachmentView,
  approvalRequestOf,
  attachmentsOf,
  collectSources,
  type DelegationStep,
  type DelegationView,
  delegationOf,
  type GenerativeUiView,
  generativeUiOf,
  isLowConfidence,
  type LoosePart,
  partsOf,
  pendingApprovalOf,
  type SourceView,
  type ToolApprovalView,
  type ToolPartView,
  type ToolPreviewView,
  type TripwireView,
  textOf,
  toolPartOf,
  toolPreviewOf,
  tripwireOf,
} from "./lib/part-guards.ts";
export {
  type ChoiceSubmission,
  type FormSubmission,
  formatUiSubmission,
  parseUiSubmission,
  type UiSubmission,
} from "./lib/ui-submission.ts";
export { ChatMessage, type ChatMessageProps } from "./ui/chat-message.tsx";
export {
  MessageParts,
  type MessagePartsProps,
  type RenderToolPart,
  type ToolPartContext,
} from "./ui/message-parts.tsx";
