"use client";

import type { ApprovalPendingProps } from "@core/contracts";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { useGenerativeUi } from "../../model/generative-ui-context.tsx";
import type { GenerativeComponentProps } from "../../model/ui-registry.ts";

/**
 * `approval-pending` (SP4 spec §5.2): the action needs a second member (four eyes), so nothing
 * can be decided here — the card says what waits and links to the approvals inbox.
 */
export function ApprovalPendingPart({ props }: GenerativeComponentProps<ApprovalPendingProps>) {
  const t = useTranslations("chat.ui.approvalPending");
  const { approvalHref } = useGenerativeUi();
  return (
    <section
      data-slot="approval-pending"
      aria-label={t("title")}
      className="flex flex-col gap-3 rounded-md border border-amber/40 bg-card p-4 text-sm"
    >
      <div className="flex items-start gap-2.5">
        <UsersIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber" />
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-semibold text-foreground">{t("title")}</h3>
          <p className="text-body text-muted-foreground">{props.summary}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <a href={approvalHref(props.approvalId)}>
            {t("open")}
            <ArrowRightIcon aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}
