// AI Elements in the client (decision 0035): installed from the registry with the pinned shadcn
// CLI in a scratch copy, then ported to the design tokens, the Atomic kit and i18n. Owned code.
//
// Reserved for modules: `ChainOfThought`, `Context`, `Plan` and `Queue` are used by no core screen
// (the core chat streams no plan, queue or token-usage parts). They stay because this barrel is the
// public `@core/client/shared/ui/ai` kit a module builds its own chat parts from; each one is
// covered by `ai-elements.test.tsx` (states, axe). Remove one only with the module that last used it.
export { Agent, AgentContent, AgentHeader, AgentSection, type AgentHeaderProps, type AgentSectionProps } from "./agent.tsx";
export { Attachment, AttachmentRemove, Attachments, type AttachmentProps, type AttachmentRemoveProps, type AttachmentsProps } from "./attachments.tsx";
export { AudioPlayer, type AudioPlayerProps } from "./audio-player.tsx";
export { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtStep, type ChainOfThoughtStepProps } from "./chain-of-thought.tsx";
export { CodeBlock, type CodeBlockProps } from "./code-block.tsx";
export {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
  type ConfirmationApproval,
  type ConfirmationProps,
} from "./confirmation.tsx";
export { Context, type ContextProps, type ContextUsage } from "./context.tsx";
export { Conversation, ConversationEmptyState, ConversationScrollButton, type ConversationEmptyStateProps, type ConversationProps } from "./conversation.tsx";
export { InlineCitation, type InlineCitationProps } from "./inline-citation.tsx";
export { Message, MessageAction, MessageActions, MessageContent, MessageResponse, type MessageActionProps, type MessageProps, type MessageRole } from "./message.tsx";
export { Plan, PlanContent, PlanFooter, PlanHeader, type PlanHeaderProps } from "./plan.tsx";
export {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuItem,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputProps,
  type PromptInputStatus,
  type PromptInputSubmitProps,
  type PromptInputTextareaProps,
} from "./prompt-input.tsx";
export { Queue, QueueItem, type QueueItemProps, type QueueItemStatus } from "./queue.tsx";
export { Reasoning, type ReasoningProps } from "./reasoning.tsx";
export { Shimmer } from "./shimmer.tsx";
export { Source, Sources, type SourceProps, type SourcesProps } from "./sources.tsx";
export { SpeechInput, type SpeechInputProps } from "./speech-input.tsx";
export { Suggestion, Suggestions, type SuggestionProps, type SuggestionsProps } from "./suggestion.tsx";
export { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger, type TaskTriggerProps } from "./task.tsx";
export { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, ToolStatus, type ToolHeaderProps, type ToolState } from "./tool.tsx";
