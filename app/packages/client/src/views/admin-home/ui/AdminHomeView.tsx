"use client";

import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { useAdminItems, type AdminItem } from "#/widgets/admin-sidebar/index.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";

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
  const t = useTranslations("admin.home");
  const { items } = useAdminItems();
  if (items.length === 0) return <EmptyState headingLevel={2} icon="shield" title={t("emptyTitle")} description={t("emptyDescription")} />;
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
 * `/admin` (SP2 spec §7, web only): the platform surface's home — every `admin` slot area the
 * staff role may open, each an empty state until SP5 registers its page. The server already
 * guarded staff + MFA; this only reads the role for what to list.
 */
export function AdminHomeView() {
  const t = useTranslations("admin");
  const me = useMe();
  return (
    <QueryPage query={me} loadingLabel={t("home.loading")}>
      {() => (
        <>
          <PageHeader
            title={t("home.title")}
            description={t("home.description")}
            meta={
              <StatusPill tone="violet" icon="shield">
                {t("topbar.badge")}
              </StatusPill>
            }
          />
          <AdminAreas />
        </>
      )}
    </QueryPage>
  );
}
