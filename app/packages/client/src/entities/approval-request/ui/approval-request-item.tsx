"use client";

import type { ApprovalRequest, ApprovalStatus } from "@core/contracts";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { approvalPreviewOf } from "../lib/approval-preview.ts";

export type ApprovalRequestItemProps = {
  readonly request: ApprovalRequest;
  /** Display name of the requester, resolved by the caller (members list, "you"); falls back to the id. */
  readonly requesterName?: string | undefined;
  /** Where the request applies, rendered by the caller (the node name widget). */
  readonly node?: ReactNode;
  /** Makes the summary a link (the inbox links each item to its detail page). */
  readonly titleRoute?: Route | undefined;
  /** Heading level of the summary in the page outline. */
  readonly headingLevel?: 2 | 3 | undefined;
  /** Decision controls (the `approval-decision` feature); none in read-only lists. */
  readonly actions?: ReactNode;
};

const TONES: Record<ApprovalStatus, StatusTone> = {
  pending: "amber",
  approved: "blue",
  executed: "emerald",
  rejected: "danger",
  failed: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

/** The request's lifecycle state in words (the color is never the only signal). */
export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  const t = useTranslations("common.approvals.status");
  return <StatusPill tone={TONES[status]}>{t(status)}</StatusPill>;
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

function Preview({ request }: Pick<ApprovalRequestItemProps, "request">) {
  const t = useTranslations("common.approvals.preview");
  const preview = approvalPreviewOf(request);
  if (preview.kind === "workflow-resume") {
    return (
      <p className="text-sm">
        <RouteLink to={preview.runRoute} className="font-medium text-primary underline underline-offset-4">
          {t("viewRun")}
        </RouteLink>
      </p>
    );
  }
  if (preview.kind === "agent-command" && preview.hasDiff) {
    return (
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium">{t("before")}</dt>
          <dd>
            {/* Wrapped, not scrolled: a scroll region would need keyboard focus (WCAG 2.1.1). */}
            <pre className="rounded-md bg-muted p-2 text-xs break-words whitespace-pre-wrap">
              {json(preview.before)}
            </pre>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium">{t("after")}</dt>
          <dd>
            <pre className="rounded-md bg-muted p-2 text-xs break-words whitespace-pre-wrap">
              {json(preview.after)}
            </pre>
          </dd>
        </div>
      </dl>
    );
  }
  return <p className="text-sm text-muted-foreground">{t("none")}</p>;
}

/**
 * One approval request (SP5 spec §3.4): summary, status, requester, node, expiry and the preview of
 * its action kind. Decisions are passed in as `actions`, so the entity stays read-only.
 */
export function ApprovalRequestItem({ request, requesterName, node, titleRoute, headingLevel = 3, actions }: ApprovalRequestItemProps) {
  const t = useTranslations("common.approvals");
  const formatDateTime = useFormatDateTime();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const settled = request.status !== "pending";
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" aria-labelledby={`approval-${request.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <Heading id={`approval-${request.id}`} className="min-w-0 text-[15px] font-medium break-words">
          {titleRoute === undefined ? (
            request.action.summary
          ) : (
            <RouteLink to={titleRoute} className="underline-offset-4 hover:underline">
              {request.action.summary}
            </RouteLink>
          )}
        </Heading>
        <ApprovalStatusPill status={request.status} />
      </header>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <div className="flex gap-1.5">
          <dt className="sr-only">{t("item.requester")}</dt>
          <dd>{t("item.requestedBy", { requester: requesterName ?? request.requestedBy.id })}</dd>
        </div>
        {node === undefined ? null : (
          <div className="flex gap-1.5">
            <dt>{t("item.node")}</dt>
            <dd className="text-foreground">{node}</dd>
          </div>
        )}
        <div className="flex gap-1.5">
          <dt className="sr-only">{t("item.when")}</dt>
          <dd>{settled ? t("item.updated", { when: formatDateTime(request.updatedAt) }) : t("item.expires", { when: formatDateTime(request.expiresAt) })}</dd>
        </div>
      </dl>
      {request.reason === null ? null : <p className="text-sm">{t("item.reason", { reason: request.reason })}</p>}
      {/* Approved but not done: said where the request stays (history, its page), not only in a toast. */}
      {request.status === "failed" ? <p className="text-sm font-medium text-destructive-text">{t("item.failed")}</p> : null}
      <Preview request={request} />
      {actions === undefined || actions === null ? null : <footer className="flex flex-col gap-2">{actions}</footer>}
    </article>
  );
}
