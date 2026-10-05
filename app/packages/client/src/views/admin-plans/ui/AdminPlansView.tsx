"use client";

import type { Plan } from "@core/contracts";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { usePlans } from "#/entities/plan/index.ts";
import { DeletePlanDialog, PlanFormDialog } from "#/features/admin-update-plan/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminPageFrame, AdminQuerySection } from "#/widgets/admin-nav/index.ts";

const column = dataTableColumnHelper<Plan>();

/** `null` = closed; `"new"` = create; a plan = edit it. */
type Editing = Plan | "new" | null;

function Features({ plan }: { plan: Plan }) {
  const t = useTranslations("admin.plans");
  if (plan.limits.features.length === 0) return <span className="text-muted-foreground">{t("noFeatures")}</span>;
  return (
    <ul aria-label={t("featuresOf", { name: plan.name })} className="flex flex-wrap gap-1">
      {plan.limits.features.map((feature) => (
        <li key={feature}>
          <Badge variant="tag" className="font-mono">
            {feature}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

type PlanActions = { onEdit: (plan: Plan) => void; onDelete: (plan: Plan) => void };

function RowActions({ plan, actions, disabled }: { plan: Plan; actions: PlanActions; disabled: boolean }) {
  const t = useTranslations("admin.plans");
  return (
    <span className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.onEdit(plan)}
        disabled={disabled}
        aria-label={t("editNamed", { name: plan.name })}
      >
        {t("edit")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.onDelete(plan)}
        disabled={disabled}
        aria-label={t("deleteNamed", { name: plan.name })}
      >
        {t("deleteAction")}
      </Button>
    </span>
  );
}

const useColumns = (actions: PlanActions, online: boolean) => {
  const t = useTranslations("admin.plans");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.accessor("name", {
        header: () => t("columns.name"),
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      }),
      column.display({
        id: "budget",
        header: () => t("columns.monthlyBudget"),
        meta: { numeric: true },
        cell: ({ row }) => formatCost(row.original.limits.monthlyMicroUsd),
      }),
      column.display({
        id: "tokens",
        header: () => t("columns.monthlyTokens"),
        meta: { numeric: true },
        cell: ({ row }) => format.number(row.original.limits.monthlyTokens),
      }),
      column.display({
        id: "connectors",
        header: () => t("columns.maxConnectors"),
        meta: { numeric: true },
        cell: ({ row }) => format.number(row.original.limits.maxConnectors),
      }),
      column.display({
        id: "features",
        header: () => t("columns.features"),
        cell: ({ row }) => <Features plan={row.original} />,
      }),
      column.accessor("updatedAt", {
        header: () => t("columns.updatedAt"),
        cell: ({ getValue }) => formatDateTime(getValue()),
      }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => <RowActions plan={row.original} actions={actions} disabled={!online} />,
      }),
    ],
    [actions, format, formatCost, formatDateTime, online, t],
  );
};

function PlansTable({
  plans,
  actions,
  onCreate,
  online,
}: {
  plans: readonly Plan[];
  actions: PlanActions;
  onCreate: () => void;
  online: boolean;
}) {
  const t = useTranslations("admin.plans");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const columns = useColumns(actions, online);
  return (
    <DataTable
      caption={t("caption")}
      captionHidden
      columns={columns}
      data={plans}
      getRowId={(plan) => plan.id}
      stateHeadingLevel={2}
      renderCard={(plan) => (
        <div className="flex flex-col gap-2">
          <span className="font-medium">{plan.name}</span>
          <span className="text-xs text-muted-foreground">
            {t("cardLimits", {
              budget: formatCost(plan.limits.monthlyMicroUsd),
              tokens: format.number(plan.limits.monthlyTokens),
              connectors: plan.limits.maxConnectors,
            })}
          </span>
          <Features plan={plan} />
          <span className="self-start">
            <RowActions plan={plan} actions={actions} disabled={!online} />
          </span>
        </div>
      )}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={2}
          icon="credit-card"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={onCreate} disabled={!online}>
              {t("create")}
            </Button>
          }
        />
      }
    />
  );
}

/**
 * `/admin/plans` (SP5 spec §6, platform.plan.manage): the plan catalog with the spend, token and
 * connector limits each plan grants, the create/edit dialog and deleting a plan no organization is on. Writes wait for the connection.
 */
export function AdminPlansView() {
  const t = useTranslations("admin.plans");
  const online = useOnlineStatus();
  const permissions = usePlatformPermissions();
  const plans = usePlans({ enabled: permissions.can("platform.plan.manage") });
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const actions = useMemo<PlanActions>(() => ({ onEdit: setEditing, onDelete: setDeleting }), []);
  return (
    <AdminPageFrame
      permission="platform.plan.manage"
      title={t("title")}
      description={t("description")}
      actions={
        <Button onClick={() => setEditing("new")} disabled={!online}>
          <Icon name="plus" />
          {t("create")}
        </Button>
      }
    >
      <AdminQuerySection query={plans} loadingLabel={t("loading")}>
        {(data) => <PlansTable plans={data} actions={actions} onCreate={() => setEditing("new")} online={online} />}
      </AdminQuerySection>
      <PlanFormDialog
        plan={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <DeletePlanDialog plan={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </AdminPageFrame>
  );
}
