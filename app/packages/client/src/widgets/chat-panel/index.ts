// Public API of the chat-panel widget (SP4 Task 9): the chat shared by web and desktop.
export { ChatPanel, type ChatPanelProps } from "./ui/chat-panel.tsx";
export { CHAT_SHELL_SLOTS, ChatSidePanel, ProjectChatPanel, type ProjectChatPanelProps } from "./ui/project-chat-panel.tsx";
export { approvalRequestHref, CHAT_PERMISSION, useChatEnvironment, useChatSidePanelAvailable, type ChatEnvironment } from "./model/use-chat-environment.ts";
export type { ChatSuggestion } from "./ui/chat-thread.tsx";
export { StatusLine, type StatusLineProps } from "./ui/status-line.tsx";
export type { ChatFailure, ChatPhase, ChatSession } from "./model/use-chat-session.ts";
