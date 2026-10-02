"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import type { UIMessage } from "ai";
import {
  type GenerativeUiView,
  generativeUiOf,
  parseUiSubmission,
  pendingApprovalOf,
  type RenderToolPart,
  type ToolPartContext,
  textOf,
  type UiSubmission,
} from "#/entities/message/index.ts";
import { ToolConfirmation } from "#/features/chat-approval/index.ts";
import { ApprovalDiff, diffPropsOf, GenerativePart } from "#/features/generative-ui/index.ts";
import type { ChatSession } from "../model/use-chat-session.ts";

/** A generative component a tool call asked for, with the call it belongs to. */
type UiRequest = { readonly ui: GenerativeUiView; readonly toolCallId: string; readonly toolName: string };

/** An output that asks for a component, or a four-eyes command waiting in the inbox (shown as `approval-pending`). */
const uiOf = (output: unknown, call: { toolCallId: string; toolName: string }, summary: string): UiRequest | null => {
  const ui = generativeUiOf(output);
  if (ui !== null) return { ui, ...call };
  const pending = pendingApprovalOf(output);
  return pending === null
    ? null
    : { ui: { component: "approval-pending", props: { approvalId: pending.approvalId, summary } }, ...call };
};

/**
 * Components the part asks for: its own output, and — when the supervisor delegated — the
 * outputs of the subagent's tool calls (`catalog.renderForm` runs inside the data agent, so its
 * `{ ui }` arrives in `subAgentToolResults`, not as a part of its own).
 */
const uiRequestsOf = (
  { tool, delegation }: ToolPartContext,
  pendingSummary: (toolName: string) => string,
): UiRequest[] => {
  const own = uiOf(tool.output, tool, pendingSummary(tool.toolName));
  const nested = (delegation?.steps ?? []).map((step) => uiOf(step.result, step, pendingSummary(step.toolName)));
  return [own, ...nested].filter((request): request is UiRequest => request !== null);
};

/** What the member answered right after `messageId` (a form or picker submission), if anything. */
const answerAfter = (messages: readonly UIMessage[], messageId: string): UiSubmission | undefined => {
  const next = messages[messages.findIndex((message) => message.id === messageId) + 1];
  return next?.role === "user" ? (parseUiSubmission(textOf(next)) ?? undefined) : undefined;
};

function ChatToolPart({
  context,
  fallback,
  session,
}: {
  context: ToolPartContext;
  fallback: ReactNode;
  session: ChatSession;
}) {
  const t = useTranslations("chat.approval");
  const { tool, delegation, preview, request, message } = context;
  // Answers go to the latest turn only: a form of an older turn was already answered or abandoned.
  const latest = session.messages.at(-1)?.id === message.id;
  const interactive = !session.busy && latest;
  // The conversation moved past this turn: what it asks can no longer be answered.
  const stale = !latest;
  const answer = stale ? answerAfter(session.messages, message.id) : undefined;
  const requests = uiRequestsOf(context, (toolName) => preview?.summary ?? t("fallbackSummary", { tool: toolName }));
  const diff = diffPropsOf(preview?.preview ?? null);
  const replacesCard = delegation === null && requests.some((item) => item.toolCallId === tool.toolCallId);

  return (
    <div className="flex flex-col gap-3">
      {replacesCard ? null : fallback}
      {requests.map((item) => (
        <GenerativePart
          key={item.toolCallId}
          ui={item.ui}
          toolCallId={item.toolCallId}
          toolName={item.toolName}
          interactive={interactive}
          stale={stale}
          answer={answer}
          fallback={item.toolCallId === tool.toolCallId && delegation === null ? fallback : null}
        />
      ))}
      {tool.approval === undefined ? null : (
        <ToolConfirmation
          tool={tool}
          preview={preview}
          request={request}
          onRespond={session.respondToApproval}
          interactive={interactive}
          stale={stale}
          diff={diff === null ? undefined : <ApprovalDiff {...diff} />}
        />
      )}
    </div>
  );
}

/**
 * The tool-part slot of the chat (FSD: the widget composes the features the message entity
 * cannot import): the approval card for a call waiting for the member, generative components
 * for outputs that ask for one, and the generic card otherwise.
 */
export const createCoreToolRenderer = (session: ChatSession): RenderToolPart =>
  function renderCoreToolPart(context, fallback) {
    return <ChatToolPart context={context} fallback={fallback} session={session} />;
  };
