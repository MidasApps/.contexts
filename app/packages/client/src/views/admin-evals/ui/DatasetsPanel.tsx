"use client";

import type { EvalDataset, OrganizationAdminSummary } from "@core/contracts";
import { useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { useAdminDatasets } from "#/entities/eval-experiment/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminQuerySection } from "#/widgets/admin-nav/index.ts";

const column = dataTableColumnHelper<EvalDataset>();

function DatasetName({ dataset }: { dataset: EvalDataset }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{dataset.name}</span>
      <span className="font-mono text-[11.5px] text-muted-foreground">{dataset.id}</span>
    </span>
  );
}

function Targets({ dataset }: { dataset: EvalDataset }) {
  const t = useTranslations("admin.evals.datasets");
  if (dataset.targetIds.length === 0) return <span className="text-muted-foreground">{t("noTargets")}</span>;
  return (
    <ul aria-label={t("targetsOf", { name: dataset.name })} className="flex flex-wrap gap-1">
      {dataset.targetIds.map((target) => (
        <li key={target}>
          <Badge variant="tag" className="font-mono">
            {target}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Platform datasets belong to no organization; a tenant one shows its name when known. */
const useScopeLabel = (organizations: readonly OrganizationAdminSummary[] | undefined) => {
  const t = useTranslations("admin.evals.datasets");
  return (dataset: EvalDataset): string =>
    dataset.tenantId === null ? t("platformScope") : t("organizationScope", { name: organizations?.find((organization) => organization.id === dataset.tenantId)?.name ?? dataset.tenantId });
};

const useColumns = (scope: (dataset: EvalDataset) => string) => {
  const t = useTranslations("admin.evals.datasets");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "name", header: () => t("columns.name"), cell: ({ row }) => <DatasetName dataset={row.original} /> }),
      column.display({ id: "scope", header: () => t("columns.scope"), cell: ({ row }) => scope(row.original) }),
      column.accessor("version", { header: () => t("columns.version"), meta: { numeric: true }, cell: ({ getValue }) => format.number(getValue()) }),
      column.display({ id: "targets", header: () => t("columns.targets"), cell: ({ row }) => <Targets dataset={row.original} /> }),
      column.accessor("createdAt", { header: () => t("columns.createdAt"), cell: ({ getValue }) => formatDateTime(getValue()) }),
    ],
    [format, formatDateTime, scope, t],
  );
};

function DatasetsTable({ datasets, organizations, onSeeExperiments }: { datasets: readonly EvalDataset[]; organizations: readonly OrganizationAdminSummary[] | undefined; onSeeExperiments: () => void }) {
  const t = useTranslations("admin.evals.datasets");
  const formatDateTime = useFormatDateTime();
  const scope = useScopeLabel(organizations);
  const columns = useColumns(scope);
  return (
    <DataTable
      caption={t("caption")}
      captionHidden
      columns={columns}
      data={datasets}
      getRowId={(dataset) => dataset.id}
      stateHeadingLevel={2}
      renderCard={(dataset) => (
        <div className="flex flex-col gap-2">
          <DatasetName dataset={dataset} />
          <span className="text-[13px]">{scope(dataset)}</span>
          <span className="text-xs text-muted-foreground">{t("cardMeta", { version: dataset.version, when: formatDateTime(dataset.createdAt) })}</span>
          <Targets dataset={dataset} />
        </div>
      )}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={2}
          icon="database"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button variant="secondary" onClick={onSeeExperiments}>
              {t("emptyAction")}
            </Button>
          }
        />
      }
    />
  );
}

/** Every dataset: the platform's eval sets per agent and the organizations' own. */
export function DatasetsPanel({ onSeeExperiments }: { onSeeExperiments: () => void }) {
  const t = useTranslations("admin.evals.datasets");
  const datasets = useAdminDatasets();
  const organizations = useAllAdminOrganizations();
  return (
    <AdminQuerySection query={datasets} loadingLabel={t("loading")}>
      {(data) => <DatasetsTable datasets={data} organizations={organizations.data} onSeeExperiments={onSeeExperiments} />}
    </AdminQuerySection>
  );
}
