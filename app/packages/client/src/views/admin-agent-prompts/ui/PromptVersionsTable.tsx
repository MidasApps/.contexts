"use client";

import type { PromptVersion } from "@core/contracts";
import { useMemo } from "react";
import { useTranslations } from "use-intl";
import { PromptVerdictPill } from "#/entities/prompt-version/index.ts";
import { canActivatePrompt, isPromptRollback, type PromptActivationRequest, type RunPromptEval } from "#/features/admin-prompt-activation/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";

const column = dataTableColumnHelper<PromptVersion>();

export type PromptVersionsTableProps = {
  agentName: string;
  versions: readonly PromptVersion[];
  activeVersion: PromptVersion | undefined;
  evalRun: RunPromptEval;
  /** Writes wait for the connection. */
  online: boolean;
  onActivate: (request: PromptActivationRequest) => void;
  onCompare: (version: PromptVersion) => void;
  onCreate: () => void;
};

type RowContext = Pick<PromptVersionsTableProps, "activeVersion" | "evalRun" | "online" | "onActivate" | "onCompare">;

function VersionLabel({ version, active }: { version: PromptVersion; active: boolean }) {
  const t = useTranslations("admin.prompts");
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono font-medium tabular-nums">{t("versionNumber", { version: version.version })}</span>
      {active ? (
        <StatusPill tone="blue" icon="circle-check">
          {t("active")}
        </StatusPill>
      ) : null}
    </span>
  );
}

/** Evaluate, activate (or roll back), force and compare for one version. */
function VersionActions({ version, activeVersion, evalRun, online, onActivate, onCompare }: RowContext & { version: PromptVersion }) {
  const t = useTranslations("admin.prompts");
  const n = version.version;
  const isActive = activeVersion?.id === version.id;
  const busy = evalRun.pendingId !== null;
  const allowed = canActivatePrompt(version);
  const rollback = isPromptRollback(version, activeVersion);
  const hintId = `activate-hint-${version.id}`;
  return (
    <span className="flex flex-col items-start gap-1.5 lg:items-end">
      <span className="flex flex-wrap gap-1.5 lg:justify-end">
        <Button variant="outline" size="sm" pending={evalRun.pendingId === version.id} disabled={!online || (busy && evalRun.pendingId !== version.id)} onClick={() => void evalRun.run(version)} aria-label={t("actions.evaluateNamed", { version: n })}>
          {t("actions.evaluate")}
        </Button>
        {isActive ? null : (
          <Button size="sm" disabled={!allowed || !online || busy} onClick={() => onActivate({ version, force: false })} aria-label={rollback ? t("actions.rollbackNamed", { version: n }) : t("actions.activateNamed", { version: n })} {...(allowed ? {} : { "aria-describedby": hintId })}>
            {rollback ? t("actions.rollback") : t("actions.activate")}
          </Button>
        )}
        {isActive || allowed ? null : (
          <Button variant="ghost" size="sm" disabled={!online || busy} onClick={() => onActivate({ version, force: true })} aria-label={t("actions.forceNamed", { version: n })}>
            {t("actions.force")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onCompare(version)} aria-label={t("actions.compareNamed", { version: n })}>
          {t("actions.compare")}
        </Button>
      </span>
      {isActive || allowed ? null : (
        <span id={hintId} className="text-[11.5px] text-muted-foreground">
          {t("activateBlocked")}
        </span>
      )}
    </span>
  );
}

const useColumns = (context: RowContext) => {
  const t = useTranslations("admin.prompts");
  const formatDateTime = useFormatDateTime();
  const { activeVersion, evalRun, online, onActivate, onCompare } = context;
  return useMemo(
    () => [
      column.display({ id: "version", header: () => t("columns.version"), cell: ({ row }) => <VersionLabel version={row.original} active={activeVersion?.id === row.original.id} /> }),
      column.accessor("note", { header: () => t("columns.note"), cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">{t("noNote")}</span> }),
      column.accessor("createdBy", { header: () => t("columns.author"), cell: ({ getValue }) => <span className="font-mono text-[11.5px]">{getValue()}</span> }),
      column.accessor("createdAt", { header: () => t("columns.createdAt"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      column.accessor("evalVerdict", { header: () => t("columns.verdict"), cell: ({ getValue }) => <PromptVerdictPill verdict={getValue()} /> }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => <VersionActions version={row.original} activeVersion={activeVersion} evalRun={evalRun} online={online} onActivate={onActivate} onCompare={onCompare} />,
      }),
    ],
    [activeVersion, evalRun, formatDateTime, onActivate, onCompare, online, t],
  );
};

/**
 * Platform prompt versions of an agent, newest first: number, note, author, date, eval verdict and
 * the actions. "Activate" stays disabled, with the reason next to it, until the version's eval
 * passed (decision 0038); the active version has no activation action.
 */
export function PromptVersionsTable({ agentName, versions, onCreate, ...context }: PromptVersionsTableProps) {
  const t = useTranslations("admin.prompts");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(context);
  return (
    <DataTable
      caption={t("caption", { agent: agentName })}
      captionHidden
      columns={columns}
      data={versions}
      getRowId={(version) => version.id}
      renderCard={(version) => (
        <div className="flex flex-col gap-2">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <VersionLabel version={version} active={context.activeVersion?.id === version.id} />
            <PromptVerdictPill verdict={version.evalVerdict} />
          </span>
          {version.note === null ? null : <span className="text-[13px]">{version.note}</span>}
          <span className="text-xs text-muted-foreground">{t("cardMeta", { author: version.createdBy, date: formatDateTime(version.createdAt) })}</span>
          <VersionActions version={version} {...context} />
        </div>
      )}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={3}
          icon="file-text"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={onCreate} disabled={!context.online}>
              {t("create")}
            </Button>
          }
        />
      }
    />
  );
}
