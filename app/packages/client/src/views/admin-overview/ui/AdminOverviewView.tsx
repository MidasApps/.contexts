"use client";

import { useTranslations } from "use-intl";
import { useAdminOverview } from "#/entities/admin-overview/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { AdminKpiCards } from "#/widgets/admin-kpi-cards/index.ts";
import { AdminPageFrame, AdminQuerySection } from "#/widgets/admin-nav/index.ts";
import { type AdminItem, useAdminItems } from "#/widgets/admin-sidebar/index.ts";

function AreaCard({ area }: { area: AdminItem }) {
  const t = useTranslations();
  const rest = area.route.id === "admin" ? area.route.rest : "";
  const descriptionKey = `admin.descriptions.${rest}`;
  return (
    <li>
      <RouteLink
        to={area.route}
        className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon name={area.item.icon} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{t(area.item.labelKey)}</span>
          {t.has(descriptionKey) ? <span className="text-sm text-muted-foreground">{t(descriptionKey)}</span> : null}
        </span>
      </RouteLink>
    </li>
  );
}

function AdminAreas() {
  const t = useTranslations("admin.overview");
  const { items } = useAdminItems();
  if (items.length === 0)
    return <EmptyState headingLevel={2} icon="shield" title={t("emptyTitle")} description={t("emptyDescription")} />;
  return (
    <section aria-labelledby="admin-areas-title" className="flex flex-col gap-3">
      <h2 id="admin-areas-title" className="text-sm font-medium text-muted-foreground">
        {t("sectionsTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((area) => (
          <AreaCard key={area.item.id} area={area} />
        ))}
      </ul>
    </section>
  );
}

/**
 * `/admin` (SP5 spec §6): the platform numbers (`GET /v1/admin/overview`) and every admin area the
 * staff role may open. A failed overview keeps the areas reachable: its error sits in its own
 * section with the request reference and a retry.
 */
export function AdminOverviewView() {
  const t = useTranslations("admin");
  const overview = useAdminOverview();
  return (
    <AdminPageFrame
      permission="platform.usage.read"
      title={t("overview.title")}
      description={t("overview.description")}
    >
      <div className="flex flex-col gap-8">
        <AdminQuerySection query={overview} loadingLabel={t("overview.loading")} rows={3}>
          {(data) => <AdminKpiCards overview={data} />}
        </AdminQuerySection>
        <AdminAreas />
      </div>
    </AdminPageFrame>
  );
}
