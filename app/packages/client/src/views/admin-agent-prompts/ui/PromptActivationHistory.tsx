"use client";

import type { PromptActivation, PromptVersion } from "@core/contracts";
import { useMemo } from "react";
import { useTranslations } from "use-intl";
import { AdminUserRef } from "#/entities/admin-user/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { PROMPT_ROWS_PER_PAGE, useLocalPages } from "../model/use-local-pages.ts";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";

const column = dataTableColumnHelper<PromptActivation>();

function Kind({ forced }: { forced: boolean }) {
  const t = useTranslations("admin.prompts.history");
  return forced ? (
    <StatusPill tone="amber" icon="alert-triangle">
      {t("forced")}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">{t("gated")}</StatusPill>
  );
}

/**
 * Activations of the platform prompt, newest (the active one) first: which version, who, when,
 * whether the eval gate was skipped and the recorded reason. Rollbacks are rows like any other.
 */
export function PromptActivationHistory({
  agentName,
  activations,
  versions,
  userLabel,
}: {
  agentName: string;
  activations: readonly PromptActivation[];
  versions: readonly PromptVersion[];
  /** Name of a user id (who activated), or the id itself while unknown. */
  userLabel: (userId: string) => string;
}) {
  const t = useTranslations("admin.prompts.history");
  const formatDateTime = useFormatDateTime();
  const versionLabel = useMemo(() => {
    const numbers = new Map(versions.map((version) => [version.id, version.version]));
    return (activation: PromptActivation): string => {
      const number = numbers.get(activation.versionId);
      return number === undefined ? t("unknownVersion") : t("version", { version: number });
    };
  }, [t, versions]);
  const columns = useMemo(
    () => [
      column.display({ id: "version", header: () => t("columns.version"), cell: ({ row }) => <span className="font-mono tabular-nums">{versionLabel(row.original)}</span> }),
      column.accessor("activatedAt", { header: () => t("columns.when"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      column.accessor("activatedBy", { header: () => t("columns.who"), cell: ({ getValue }) => <AdminUserRef id={getValue()} label={userLabel(getValue())} /> }),
      column.accessor("forced", { header: () => t("columns.kind"), cell: ({ getValue }) => <Kind forced={getValue()} /> }),
      column.accessor("reason", { header: () => t("columns.reason"), cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">{t("noReason")}</span> }),
    ],
    [formatDateTime, t, userLabel, versionLabel],
  );
  const paged = useLocalPages(activations, PROMPT_ROWS_PER_PAGE, t("pagination"));
  if (activations.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <DataTable
      caption={t("caption", { agent: agentName })}
      captionHidden
      columns={columns}
      data={paged.rows}
      pagination={paged.pagination}
      getRowId={(activation) => activation.id}
      empty={null}
      renderCard={(activation) => (
        <div className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono font-medium tabular-nums">{versionLabel(activation)}</span>
            <Kind forced={activation.forced} />
          </span>
          <span className="text-xs text-muted-foreground">{t("cardMeta", { who: userLabel(activation.activatedBy), date: formatDateTime(activation.activatedAt) })}</span>
          {activation.reason === null ? null : <span className="text-body">{activation.reason}</span>}
        </div>
      )}
    />
  );
}
