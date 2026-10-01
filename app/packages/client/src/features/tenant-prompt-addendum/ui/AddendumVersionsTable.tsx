"use client";

import type { PromptVersion } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "#/shared/ui/atoms/Table/Table.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
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
  if (verdict === "passed") return <StatusPill tone="emerald" icon="circle-check">{t("passed")}</StatusPill>;
  if (verdict === "failed") return <StatusPill tone="danger" icon="circle-x">{t("failed")}</StatusPill>;
  return <StatusPill tone="neutral">{t("none")}</StatusPill>;
}

function RowActions({ version, agentName, isActive, hasActive, actions, disabled }: { version: PromptVersion; agentName: string; isActive: boolean; hasActive: boolean; actions: AddendumActions; disabled: boolean }) {
  const t = useTranslations("settings.agents.instructions");
  const pendingHere = actions.pending?.versionId === version.id ? actions.pending.action : null;
  const busy = disabled || actions.pending !== null;
  const names = { version: version.version, agent: agentName };
  return (
    <span className="flex flex-wrap justify-end gap-2">
      {version.evalVerdict === "passed" ? null : (
        <Button variant="outline" size="sm" disabled={busy} pending={pendingHere === "evaluate"} onClick={() => void actions.evaluate(version)} aria-label={t("evaluateVersion", names)}>
          {t("evaluate")}
        </Button>
      )}
      {isActive ? null : (
        <Button
          variant="outline"
          size="sm"
          // The server refuses a version without a passed verdict; the button says so up front.
          disabled={busy || version.evalVerdict !== "passed"}
          title={version.evalVerdict === "passed" ? undefined : t("needsEval")}
          pending={pendingHere === "activate"}
          onClick={() => void actions.activate(version)}
          aria-label={t(hasActive && version.evalVerdict === "passed" ? "rollbackVersion" : "activateVersion", names)}
        >
          {t("activate")}
        </Button>
      )}
    </span>
  );
}

/** The versions of an organization's instructions for an agent, newest first, with their verdict and actions. */
export function AddendumVersionsTable({ agentName, versions, activeId, hasActive, actions, disabled }: AddendumVersionsTableProps) {
  const t = useTranslations("settings.agents.instructions");
  const formatDateTime = useFormatDateTime();
  const caption = t("versionsCaption", { agent: agentName });
  return (
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
            <TableCell className={version.note === null ? "text-muted-foreground" : undefined}>{version.note ?? t("noNote")}</TableCell>
            <TableCell>{formatDateTime(version.createdAt)}</TableCell>
            <TableCell>
              <Verdict verdict={version.evalVerdict} />
            </TableCell>
            {actions === null ? null : (
              <TableCell>
                <RowActions version={version} agentName={agentName} isActive={version.id === activeId} hasActive={hasActive} actions={actions} disabled={disabled} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
