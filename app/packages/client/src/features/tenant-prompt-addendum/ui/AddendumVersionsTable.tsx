"use client";

import type { PromptVersion } from "@core/contracts";
import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/shared/ui/atoms/Table/Table.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import type { AddendumActions } from "../model/use-addendum-actions.ts";

export type AddendumVersionsTableProps = {
  agentName: string;
  versions: readonly PromptVersion[];
  activeId: string | undefined;
  /** Had an activation before: activating an older version is a rollback. */
  hasActive: boolean;
  /** `null` for readers: no evaluate or activate buttons. */
  actions: AddendumActions | null;
  disabled: boolean;
};

function Verdict({ verdict }: { verdict: PromptVersion["evalVerdict"] }) {
  const t = useTranslations("settings.agents.instructions.verdict");
  if (verdict === "passed")
    return (
      <StatusPill tone="emerald" icon="circle-check">
        {t("passed")}
      </StatusPill>
    );
  if (verdict === "failed")
    return (
      <StatusPill tone="danger" icon="circle-x">
        {t("failed")}
      </StatusPill>
    );
  return <StatusPill tone="neutral">{t("none")}</StatusPill>;
}

type RowActionsProps = {
  version: PromptVersion;
  agentName: string;
  isActive: boolean;
  hasActive: boolean;
  actions: AddendumActions;
  disabled: boolean;
  onActivate: (version: PromptVersion) => void;
};

function RowActions({ version, agentName, isActive, hasActive, actions, disabled, onActivate }: RowActionsProps) {
  const t = useTranslations("settings.agents.instructions");
  const reasonId = useId();
  const needsEval = version.evalVerdict !== "passed";
  const pendingHere = actions.pending?.versionId === version.id ? actions.pending.action : null;
  const busy = disabled || actions.pending !== null;
  const names = { version: version.version, agent: agentName };
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {/* Written out, not a tooltip: a disabled button gets no focus or hover to reveal one. */}
      {isActive || !needsEval ? null : (
        <span id={reasonId} className="text-xs text-muted-foreground">
          {t("needsEval")}
        </span>
      )}
      {version.evalVerdict === "passed" ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          pending={pendingHere === "evaluate"}
          onClick={() => void actions.evaluate(version)}
          aria-label={t("evaluateVersion", names)}
        >
          {t("evaluate")}
        </Button>
      )}
      {isActive ? null : (
        <Button
          variant="outline"
          size="sm"
          // The server refuses a version without a passed verdict; the button says so up front.
          disabled={busy || needsEval}
          pending={pendingHere === "activate"}
          onClick={() => onActivate(version)}
          aria-label={t(hasActive && !needsEval ? "rollbackVersion" : "activateVersion", names)}
          aria-describedby={needsEval ? reasonId : undefined}
        >
          {t("activate")}
        </Button>
      )}
    </span>
  );
}

/**
 * The versions of an organization's instructions for an agent, newest first, with their verdict and
 * actions. Activating (or rolling back) changes how the agent answers for the whole organization,
 * so it asks first, naming the agent and the version.
 */
export function AddendumVersionsTable({
  agentName,
  versions,
  activeId,
  hasActive,
  actions,
  disabled,
}: AddendumVersionsTableProps) {
  const t = useTranslations("settings.agents.instructions");
  const formatDateTime = useFormatDateTime();
  const caption = t("versionsCaption", { agent: agentName });
  const [confirming, setConfirming] = useState<PromptVersion | null>(null);
  const names =
    confirming === null ? { version: 0, agent: agentName } : { version: confirming.version, agent: agentName };
  return (
    <>
      <Table scrollLabel={caption}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("columns.version")}</TableHead>
            <TableHead>{t("columns.note")}</TableHead>
            <TableHead>{t("columns.created")}</TableHead>
            <TableHead>{t("columns.verdict")}</TableHead>
            {actions === null ? null : (
              <TableHead>
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((version) => (
            <TableRow key={version.id}>
              <TableHead scope="row" className="font-normal">
                <span className="flex flex-wrap items-center gap-2">
                  {t("versionLabel", { version: version.version })}
                  {version.id === activeId ? <StatusPill tone="blue">{t("active")}</StatusPill> : null}
                </span>
              </TableHead>
              <TableCell className={version.note === null ? "text-muted-foreground" : undefined}>
                {version.note ?? t("noNote")}
              </TableCell>
              <TableCell>{formatDateTime(version.createdAt)}</TableCell>
              <TableCell>
                <Verdict verdict={version.evalVerdict} />
              </TableCell>
              {actions === null ? null : (
                <TableCell>
                  <RowActions
                    version={version}
                    agentName={agentName}
                    isActive={version.id === activeId}
                    hasActive={hasActive}
                    actions={actions}
                    disabled={disabled}
                    onActivate={setConfirming}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {actions === null ? null : (
        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(open) => (open ? undefined : setConfirming(null))}
          title={t(hasActive ? "confirmActivate.rollbackTitle" : "confirmActivate.title", names)}
          description={t("confirmActivate.description", names)}
          confirmLabel={t(hasActive ? "rollback" : "activate")}
          // The outcome (toast or the refusal) is shown by the instructions card.
          onConfirm={() => (confirming === null ? undefined : void actions.activate(confirming))}
        />
      )}
    </>
  );
}
