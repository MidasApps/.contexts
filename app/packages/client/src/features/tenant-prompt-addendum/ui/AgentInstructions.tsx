"use client";

import type { PromptAgentId, PromptVersion } from "@core/contracts";
import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import { activeVersionOf, useAddendumActivations, useAddendumVersions } from "#/entities/prompt-version/index.ts";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";
import { useAddendumActions } from "../model/use-addendum-actions.ts";
import { AddendumVersionDialog } from "./AddendumVersionDialog.tsx";
import { AddendumVersionsTable } from "./AddendumVersionsTable.tsx";

export type AgentInstructionsProps = {
  organizationId: string;
  agentId: PromptAgentId;
  agentName: string;
  /** The viewer holds `core.prompt.write`; readers see the text and the versions only. */
  canWrite: boolean;
};

function ActiveText({ active }: { active: PromptVersion | undefined }) {
  const t = useTranslations("settings.agents.instructions");
  if (active === undefined) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground-strong">{t("activeLabel", { version: active.version })}</p>
      <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-body-sm whitespace-pre-wrap">
        {active.body}
      </pre>
    </div>
  );
}

/**
 * The organization's own instructions for one agent (decision 0038): the active addendum, its
 * versions, and for writers a new version, its evaluation and the eval-gated activation. An older
 * version is brought back by activating it again.
 */
export function AgentInstructions({ organizationId, agentId, agentName, canWrite }: AgentInstructionsProps) {
  const t = useTranslations("settings.agents.instructions");
  const online = useOnlineStatus();
  const headingId = useId();
  const versions = useAddendumVersions(organizationId, agentId);
  const activations = useAddendumActivations(organizationId, agentId);
  const actions = useAddendumActions(organizationId, agentId);
  const [writing, setWriting] = useState(false);
  const failed = versions.isError ? versions : activations.isError ? activations : null;
  const active = activeVersionOf(versions.data ?? [], activations.data ?? []);

  const body = (): React.ReactNode => {
    if (failed !== null) {
      if (isApiErrorStatus(failed.error, 403)) return <NoAccessState />;
      return <ApiErrorState error={failed.error} onRetry={() => void failed.refetch()} retrying={failed.isFetching} />;
    }
    if (versions.data === undefined || activations.data === undefined) return <LoadingState label={t("loading")} rows={2} />;
    return (
      <>
        <ActiveText active={active} />
        {actions.failure === null ? null : (
          <p role="alert" className="text-sm font-medium text-destructive-text">
            {t("failed")}: {actions.failure}
          </p>
        )}
        {actions.pending?.action === "evaluate" ? (
          <p role="status" className="text-xs text-muted-foreground">
            {t("evaluating")}
          </p>
        ) : null}
        {versions.data.length === 0 ? null : (
          <AddendumVersionsTable
            agentName={agentName}
            versions={versions.data}
            activeId={active?.id}
            hasActive={activations.data.length > 0}
            actions={canWrite ? actions : null}
            disabled={!online}
          />
        )}
      </>
    );
  };

  // A group, not a region: the page shows one per agent with the same title.
  return (
    <div role="group" aria-labelledby={headingId} data-slot="agent-instructions" className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h4 id={headingId} className="text-sm font-semibold">
            {t("title")}
          </h4>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        {canWrite ? (
          <Button size="sm" className="shrink-0" disabled={!online || versions.data === undefined} onClick={() => setWriting(true)} aria-label={t("writeFor", { agent: agentName })}>
            <Icon name="pencil" />
            {t("write")}
          </Button>
        ) : null}
      </div>
      {body()}
      {canWrite ? (
        <AddendumVersionDialog organizationId={organizationId} agentId={agentId} agentName={agentName} initialBody={active?.body ?? ""} open={writing} onOpenChange={setWriting} />
      ) : null}
    </div>
  );
}
