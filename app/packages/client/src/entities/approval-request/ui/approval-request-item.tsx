import type { ApprovalRequest } from "@core/contracts";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { approvalPreviewOf } from "../lib/approval-preview.ts";

export type ApprovalRequestItemProps = {
  readonly request: ApprovalRequest;
  /** Display name of the requester, resolved by the caller (members list); falls back to the id. */
  readonly requesterName?: string;
  /** Approve/reject controls (the `decide-approval` feature of Task 14); none in read-only lists. */
  readonly actions?: ReactNode;
  /** Renders the run link (the router's `Link`); a plain anchor by default. */
  readonly renderLink?: ((props: { readonly href: string; readonly children: ReactNode }) => ReactNode) | undefined;
};

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const Preview = ({ request, renderLink }: Pick<ApprovalRequestItemProps, "request" | "renderLink">) => {
  const t = useTranslations("common.approvals.preview");
  const preview = approvalPreviewOf(request);
  if (preview.kind === "workflow-resume") {
    const children = t("viewRun");
    return renderLink === undefined ? <a href={preview.runHref}>{children}</a> : renderLink({ href: preview.runHref, children });
  }
  if (preview.kind === "agent-command" && preview.hasDiff) {
    return (
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium">{t("before")}</dt>
          <dd>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{json(preview.before)}</pre>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium">{t("after")}</dt>
          <dd>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{json(preview.after)}</pre>
          </dd>
        </div>
      </dl>
    );
  }
  return <p className="text-sm text-muted-foreground">{t("none")}</p>;
};

/**
 * One approval request of the inbox (SP5 spec §3.4): summary, status, requester, expiry and the
 * preview of its action kind. Decisions are passed in as `actions`, so the entity stays read-only.
 */
export const ApprovalRequestItem = ({ request, requesterName, actions, renderLink }: ApprovalRequestItemProps) => {
  const t = useTranslations("common.approvals");
  const format = useFormatter();
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-labelledby={`approval-${request.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`approval-${request.id}`} className="font-medium">
          {request.action.summary}
        </h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`status.${request.status}`)}</span>
      </header>
      <p className="text-sm text-muted-foreground">
        {t("item.requestedBy", { requester: requesterName ?? request.requestedBy.id })} ·{" "}
        {t("item.expires", { when: format.dateTime(new Date(request.expiresAt), { dateStyle: "medium", timeStyle: "short" }) })}
      </p>
      <Preview request={request} renderLink={renderLink} />
      {actions === undefined ? null : <footer className="flex gap-2">{actions}</footer>}
    </article>
  );
};
