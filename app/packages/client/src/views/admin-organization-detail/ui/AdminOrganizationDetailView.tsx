"use client";

import type { OrganizationAdminDetail, OrganizationAdminSummary, Permission, Plan } from "@core/contracts";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { BudgetUsagePill, OrganizationStatusPill, useAdminOrganization } from "#/entities/admin-organization/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { usePlans } from "#/entities/plan/index.ts";
import { BudgetOverrideForm, OrganizationPlanForm, OrganizationStatusAction } from "#/features/admin-update-organization/index.ts";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { AdminPageFrame, AdminQuerySection } from "#/widgets/admin-nav/index.ts";
import { PageNotFound } from "#/widgets/page-state/index.ts";

/** Areas that take the organization as a URL filter, each shown when the role may open it. */
const RELATED: readonly { rest: string; icon: IconName; permission: Permission }[] = [
  { rest: "agents", icon: "bot", permission: "platform.agent.manage" },
  { rest: "connectors", icon: "plug", permission: "platform.connector.read" },
  { rest: "workflows", icon: "workflow", permission: "platform.workflow.manage" },
  { rest: "traces", icon: "scroll-text", permission: "platform.trace.read" },
  { rest: "flags", icon: "flag", permission: "platform.flag.manage" },
  { rest: "costs", icon: "wallet", permission: "platform.usage.read" },
];

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Summary({ organization, planName }: { organization: OrganizationAdminDetail; planName: string }) {
  const t = useTranslations("admin.organizationDetail.summary");
  const tList = useTranslations("admin.organizations");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const mono = "font-mono tabular-nums";
  return (
    <SectionCard title={t("title")} description={t("description")}>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label={tList("columns.status")}>
          <OrganizationStatusPill status={organization.status} />
        </Stat>
        <Stat label={tList("columns.plan")}>{planName}</Stat>
        <Stat label={tList("columns.costMtd")}>
          <span className={mono}>{formatCost(organization.costMtdMicroUsd)}</span>
        </Stat>
        <Stat label={tList("columns.cap")}>
          <span className={mono}>{formatCost(organization.budget.caps.monthlyMicroUsd)}</span>{" "}
          <span className="ml-1 text-xs text-muted-foreground">{tList(`budgetSource.${organization.budget.source}`)}</span>
        </Stat>
        <Stat label={t("tokenCap")}>
          <span className={mono}>{format.number(organization.budget.caps.monthlyTokens)}</span>
        </Stat>
        <Stat label={tList("columns.usage")}>
          <BudgetUsagePill organization={organization} />
        </Stat>
        <Stat label={t("members")}>
          <span className={mono}>{format.number(organization.memberCount)}</span>{" "}
          <span className="ml-1 text-xs text-muted-foreground">{t("membersHint")}</span>
        </Stat>
      </dl>
    </SectionCard>
  );
}

function RelatedLinks({ organization }: { organization: OrganizationAdminSummary }) {
  const t = useTranslations("admin.organizationDetail.related");
  const tNav = useTranslations("shell.nav.admin");
  const permissions = usePlatformPermissions();
  const visible = RELATED.filter(({ permission }) => permissions.can(permission));
  return (
    <SectionCard title={t("title")} description={t("description")}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {visible.map(({ rest, icon }) => (
          <li key={rest}>
            <RouteLink
              to={{ id: "admin", rest, search: { organizationId: organization.id } }}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Icon name={icon} className="size-4 text-muted-foreground" />
              {tNav(rest)}
            </RouteLink>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function Detail({ organization, plans, canWrite }: { organization: OrganizationAdminDetail; plans: readonly Plan[] | undefined; canWrite: boolean }) {
  const t = useTranslations("admin.organizationDetail");
  const tList = useTranslations("admin.organizations");
  const planName = organization.planId === null ? tList("defaultPlan") : (plans?.find((plan) => plan.id === organization.planId)?.name ?? organization.planId);
  return (
    <div className="flex flex-col gap-4">
      <Summary organization={organization} planName={planName} />
      {canWrite ? (
        <>
          <SectionCard title={t("plan.title")} description={t("plan.description")}>
            {/* Remount when the saved plan changes so the select starts from it. */}
            <OrganizationPlanForm key={organization.planId ?? "default"} organization={organization} plans={plans ?? []} />
          </SectionCard>
          <SectionCard title={t("budget.title")} description={organization.budget.override === null ? t("budget.descriptionNone") : t("budget.descriptionActive")}>
            <BudgetOverrideForm key={JSON.stringify(organization.budget.override)} organization={organization} />
          </SectionCard>
          <SectionCard
            tone={organization.status === "active" ? "danger" : "default"}
            title={t("status.title")}
            description={organization.status === "active" ? t("status.descriptionActive") : t("status.descriptionSuspended")}
          >
            <div>
              <OrganizationStatusAction organization={organization} />
            </div>
          </SectionCard>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t("readOnly")}</p>
      )}
      <RelatedLinks organization={organization} />
    </div>
  );
}

/**
 * `/admin/organizations/:organizationId` (SP5 spec §6, platform.organization.read): one
 * organization's status, plan, cost and budget; staff with `platform.organization.update` assign
 * the plan, override the budget and suspend or reactivate it. The organization comes from
 * `GET /v1/admin/organizations/{id}` (decision 0044), with its member count; a 404 is not found.
 */
export function AdminOrganizationDetailView() {
  const t = useTranslations("admin.organizationDetail");
  const tList = useTranslations("admin.organizations");
  const organizationId = (useRouter().useRouteParams()["rest"] ?? "").split("/")[1] ?? "";
  const permissions = usePlatformPermissions();
  const query = useAdminOrganization(organizationId, { enabled: permissions.can("platform.organization.read") });
  const plans = usePlans({ enabled: permissions.can("platform.plan.manage") });
  const organization = query.data ?? undefined;
  if (organizationId === "" || (query.status === "success" && query.data === null)) return <PageNotFound />;
  return (
    <AdminPageFrame
      permission="platform.organization.read"
      title={organization?.name ?? t("title")}
      description={organization === undefined ? undefined : t("idLine", { id: organization.id })}
      back={{ rest: "organizations", label: tList("title") }}
      meta={organization === undefined ? undefined : <OrganizationStatusPill status={organization.status} />}
    >
      <AdminQuerySection query={query} loadingLabel={t("loading")}>
        {(data) => <Detail organization={data} plans={plans.data} canWrite={permissions.can("platform.organization.update")} />}
      </AdminQuerySection>
    </AdminPageFrame>
  );
}
