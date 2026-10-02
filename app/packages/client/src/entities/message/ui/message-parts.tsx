"use client";

import type { UIMessage } from "ai";
import { ClipboardCheckIcon, ShieldAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { formatFileSize } from "#/shared/lib/format/file-size.ts";
import { useAgentLabel, useCommandLabel, useToolLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { Agent, AgentContent, AgentHeader, AgentSection } from "#/shared/ui/ai/agent.tsx";
import { Attachment, Attachments } from "#/shared/ui/ai/attachments.tsx";
import { InlineCitation } from "#/shared/ui/ai/inline-citation.tsx";
import { MessageResponse } from "#/shared/ui/ai/message.tsx";
import { Reasoning } from "#/shared/ui/ai/reasoning.tsx";
import { Source, Sources } from "#/shared/ui/ai/sources.tsx";
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from "#/shared/ui/ai/task.tsx";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, ToolStatus } from "#/shared/ui/ai/tool.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { linkCitationMarkers } from "../lib/citation-markers.ts";
import {
  approvalRequestOf,
  attachmentsOf,
  collectSources,
  delegationOf,
  partsOf,
  toolPartOf,
  toolPreviewOf,
  tripwireOf,
  type ApprovalRequestView,
  type AttachmentView,
  type DelegationView,
  type LoosePart,
  type SourceView,
  type ToolPartView,
  type ToolPreviewView,
  type TripwireView,
} from "../lib/part-guards.ts";
import { parseUiSubmission } from "../lib/ui-submission.ts";

/** What a feature needs to take over a tool part (approval card, generative UI). */
export type ToolPartContext = {
  readonly tool: ToolPartView;
  /** Set when the supervisor delegated: the subagent, its request and its tool calls. */
  readonly delegation: DelegationView | null;
  /** `data-tool-preview` of this call, when the server sent one. */
  readonly preview: ToolPreviewView | undefined;
  /** `data-tool-call-approval` of this call: the real tool name and arguments. */
  readonly request: ApprovalRequestView | undefined;
  readonly message: UIMessage;
};

/**
 * Slot of the features layer (FSD: an entity cannot import features). Receives the default
 * view; return it, wrap it, or replace it.
 */
export type RenderToolPart = (context: ToolPartContext, fallback: ReactNode) => ReactNode;

export type MessagePartsProps = {
  message: UIMessage;
  /** This message is being written right now. */
  streaming?: boolean | undefined;
  /** `false` hides reasoning (a tenant may disable it, SP4 spec §5.1). */
  showReasoning?: boolean | undefined;
  renderTool?: RenderToolPart | undefined;
  /** A control for one sent attachment (open it); the host knows how to read files. */
  attachmentAction?: ((file: AttachmentView) => ReactNode) | undefined;
};

const KNOWN_AGENTS = new Set(["knowledge", "data", "action", "web"]);

function DelegationCard({ tool, delegation }: { tool: ToolPartView; delegation: DelegationView }) {
  const t = useTranslations("chat.delegation");
  const agentLabel = useAgentLabel();
  const toolLabel = useToolLabel();
  // A module agent named by its module reads as its label; only an agent no catalog names shows its key.
  const named = agentLabel(delegation.agentId);
  const agent = KNOWN_AGENTS.has(delegation.agentId) ? t(`agents.${delegation.agentId as "knowledge"}`) : named === delegation.agentId ? t("agents.unknown", { id: delegation.agentId }) : named;
  return (
    <Agent data-agent={delegation.agentId}>
      <AgentHeader name={t("label", { agent })} status={<ToolStatus state={tool.state} />} />
      <AgentContent>
        {delegation.prompt === undefined ? null : (
          <AgentSection title={t("request")}>
            <p className="text-[13px] whitespace-pre-wrap text-foreground">{delegation.prompt}</p>
          </AgentSection>
        )}
        {delegation.steps.length === 0 ? null : (
          <AgentSection title={t("stepsTitle")}>
            <Task defaultOpen>
              <TaskTrigger title={t("steps", { count: delegation.steps.length })} />
              <TaskContent>
                {delegation.steps.map((step) => (
                  <TaskItem key={step.toolCallId}>
                    <TaskItemFile>{toolLabel(step.toolName)}</TaskItemFile>
                    {step.isError ? <span className="ml-1.5 text-destructive-text">{t("stepFailed")}</span> : null}
                  </TaskItem>
                ))}
              </TaskContent>
            </Task>
          </AgentSection>
        )}
        {delegation.text === undefined ? null : (
          <AgentSection title={t("result")}>
            <MessageResponse>{delegation.text}</MessageResponse>
          </AgentSection>
        )}
        {tool.errorText === undefined ? null : <ToolOutput errorText={tool.errorText} />}
      </AgentContent>
    </Agent>
  );
}

function ToolCard({ tool }: { tool: ToolPartView }) {
  const t = useTranslations("chat.tool");
  const toolLabel = useToolLabel();
  return (
    <Tool data-tool={tool.toolName}>
      <ToolHeader title={t("title", { name: toolLabel(tool.toolName) })} state={tool.state} />
      <ToolContent>
        {tool.input === undefined ? null : <ToolInput value={tool.input} />}
        <ToolOutput value={tool.output} errorText={tool.errorText} />
      </ToolContent>
    </Tool>
  );
}

function TripwireAlert({ tripwire }: { tripwire: TripwireView }) {
  const t = useTranslations("chat.tripwire");
  const known = tripwire.processorId !== undefined && tripwire.processorId !== "title" && t.has(tripwire.processorId as "default");
  return (
    <Alert variant="warning" data-slot="tripwire" data-processor={tripwire.processorId ?? "unknown"}>
      <ShieldAlertIcon aria-hidden="true" />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription className="text-inherit">{t(known ? (tripwire.processorId as "default") : "default")}</AlertDescription>
    </Alert>
  );
}

/** A form or picker answer the member sent (`ui-submission.ts`), shown as a chip instead of its JSON. */
function UserText({ text }: { text: string }) {
  const t = useTranslations("chat.message");
  const commandLabel = useCommandLabel();
  const submission = parseUiSubmission(text);
  if (submission === null) return <p className="whitespace-pre-wrap">{text}</p>;
  return (
    <p data-slot="ui-submission" className="flex items-center gap-2">
      <ClipboardCheckIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      {submission.kind === "picker" ? t("choiceSubmitted", { choice: submission.labels.join(", ") }) : t("formSubmitted", { command: commandLabel(submission.commandId) })}
    </p>
  );
}

type Lookup = {
  readonly previews: ReadonlyMap<string, ToolPreviewView>;
  readonly requests: ReadonlyMap<string, ApprovalRequestView>;
  readonly sources: ReadonlyMap<string, SourceView>;
  /** Assistant text parts with their citation markers numbered across the whole message. */
  readonly texts: ReadonlyMap<number, string>;
  /** Citation ids in the order the text cites them. */
  readonly cited: readonly string[];
};

const indexParts = (message: UIMessage, parts: readonly LoosePart[]): Lookup => {
  const previews = new Map<string, ToolPreviewView>();
  const requests = new Map<string, ApprovalRequestView>();
  const texts = new Map<number, string>();
  let cited: readonly string[] = [];
  parts.forEach((part, index) => {
    const preview = toolPreviewOf(part);
    if (preview !== null) previews.set(preview.toolCallId, preview);
    const request = approvalRequestOf(part);
    if (request !== null) requests.set(request.toolCallId, request);
    if (message.role !== "assistant" || part.type !== "text" || typeof part["text"] !== "string") return;
    const linked = linkCitationMarkers(part["text"], cited);
    cited = linked.order;
    texts.set(index, linked.text);
  });
  return { previews, requests, sources: collectSources(parts), texts, cited };
};

/**
 * Parts of one message → components (SP4 spec §5.1): text as hardened markdown with numbered
 * citations, reasoning and tool calls collapsed, delegation as an agent card, a tripwire as an
 * alert, and the sources the text cites. Parts it does not know render nothing.
 */
export function MessageParts({ message, streaming = false, showReasoning = true, renderTool, attachmentAction }: MessagePartsProps) {
  const t = useTranslations("chat");
  const format = useFormatter();
  const parts = partsOf(message);
  const lookup = indexParts(message, parts);
  const lastIndex = parts.length - 1;
  const sourceAt = (index: number): SourceView | undefined => lookup.sources.get(lookup.cited[index - 1] ?? "");

  const renderText = (text: string, key: number): ReactNode => {
    if (message.role !== "assistant") return <UserText key={key} text={text} />;
    return (
      <MessageResponse
        key={key}
        streaming={streaming && key === lastIndex}
        renderCitation={(index) => (
          <InlineCitation index={index} title={sourceAt(index)?.title}>
            {sourceAt(index)?.snippet}
          </InlineCitation>
        )}
      >
        {lookup.texts.get(key) ?? text}
      </MessageResponse>
    );
  };

  const renderToolPart = (tool: ToolPartView, key: number): ReactNode => {
    const delegation = delegationOf(tool);
    const fallback = delegation === null ? <ToolCard tool={tool} /> : <DelegationCard tool={tool} delegation={delegation} />;
    const context: ToolPartContext = { tool, delegation, preview: lookup.previews.get(tool.toolCallId), request: lookup.requests.get(tool.toolCallId), message };
    return <div key={key}>{renderTool === undefined ? fallback : renderTool(context, fallback)}</div>;
  };

  const rendered = parts.map((part, index): ReactNode => {
    if (part.type === "text" && typeof part["text"] === "string") return part["text"].trim() === "" ? null : renderText(part["text"], index);
    if (part.type === "reasoning" && typeof part["text"] === "string") {
      if (!showReasoning || part["text"].trim() === "") return null;
      return <Reasoning key={index} text={part["text"]} streaming={streaming && part["state"] === "streaming"} />;
    }
    const tool = toolPartOf(part);
    if (tool !== null) return renderToolPart(tool, index);
    const tripwire = tripwireOf(part);
    return tripwire === null ? null : <TripwireAlert key={index} tripwire={tripwire} />;
  });

  const attachments = attachmentsOf(message);
  return (
    <>
      {rendered}
      {attachments.length === 0 ? null : (
        <Attachments label={t("message.attachments")}>
          {attachments.map((file) => (
            <Attachment
              key={file.fileId}
              name={file.name}
              mediaType={file.mediaType}
              detail={file.sizeBytes === undefined ? undefined : formatFileSize(file.sizeBytes, format.number)}
              action={attachmentAction?.(file)}
            />
          ))}
        </Attachments>
      )}
      {lookup.cited.length === 0 ? null : (
        <Sources count={lookup.cited.length}>
          {lookup.cited.map((id, index) => {
            const source = lookup.sources.get(id);
            return <Source key={id} index={index + 1} title={source?.title ?? t("elements.citation.fallback", { index: index + 1 })} href={source?.url} snippet={source?.snippet} />;
          })}
        </Sources>
      )}
    </>
  );
}
