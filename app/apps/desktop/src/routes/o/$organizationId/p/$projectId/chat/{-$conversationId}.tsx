import { ChatView } from "@core/client/views/chat";
import { createFileRoute } from "@tanstack/react-router";

// The chat of a project (SP4 Task 13): one route for a new conversation and for a stored one
// (optional path param); the shared view reads the conversation through the router port.
export const Route = createFileRoute("/o/$organizationId/p/$projectId/chat/{-$conversationId}")({
  component: ChatView,
});
