"use client";

import type { Organization } from "@core/contracts";
import { useTranslations } from "use-intl";
import { orderByLastUsed, OrganizationAvatar } from "#/entities/organization/index.ts";
import { useMe, useMyOrganizations } from "#/entities/session/index.ts";
import { CreateOrganizationForm } from "#/features/create-organization/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "#/shared/ui/atoms/Card/Card.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";

function OrganizationList({ organizations, lastUsedId }: { organizations: readonly Organization[]; lastUsedId: string | undefined }) {
  const t = useTranslations("shell.organizations");
  return (
    <ul aria-label={t("listLabel")} className="grid gap-2 sm:grid-cols-2">
      {orderByLastUsed(organizations, lastUsedId).map((organization) => (
        <li key={organization.id}>
          <RouteLink
            to={{ id: "organization", organizationId: organization.id }}
            className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:-outline-offset-2"
          >
            <OrganizationAvatar name={organization.name} size="md" decorative />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{organization.name}</span>
              {organization.status === "suspended" ? <span className="text-xs text-amber-foreground">{t("suspended")}</span> : null}
            </span>
            {organization.id === lastUsedId ? <Badge variant="tag">{t("lastUsed")}</Badge> : null}
            <Icon name="chevron-right" className="size-4 text-muted-foreground" />
          </RouteLink>
        </li>
      ))}
    </ul>
  );
}

function OrganizationsSection() {
  const t = useTranslations("shell.organizations");
  const me = useMe();
  const organizations = useMyOrganizations();
  if (organizations.isPending) return <LoadingState label={t("loading")} rows={4} />;
  if (organizations.isError) return <ApiErrorState error={organizations.error} onRetry={() => void organizations.refetch()} retrying={organizations.isFetching} />;
  if (organizations.data.length === 0) return <EmptyState icon="building" title={t("emptyTitle")} description={t("emptyDescription")} />;
  return (
    <div className="flex flex-col gap-3">
      <OrganizationList organizations={organizations.data} lastUsedId={me.data?.lastContext.organizationId} />
      {organizations.hasNextPage ? (
        <Button variant="outline" className="self-start" pending={organizations.isFetchingNextPage} onClick={() => void organizations.fetchNextPage()}>
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * `/organizations` (SP2 spec §4): the user's organizations, the last used first, and a form to
 * create one (the creator becomes owner). Loading, empty and error states with retry.
 */
export function OrganizationsView() {
  const t = useTranslations("shell.organizations");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="organizations-list-heading" className="flex flex-col gap-3">
          <h2 id="organizations-list-heading" className="text-sm font-semibold">
            {t("listLabel")}
          </h2>
          <OrganizationsSection />
        </section>
        <Card role="region" aria-labelledby="create-organization-heading" className="self-start">
          <CardHeader>
            <CardTitle as="h2" id="create-organization-heading">
              {t("create.title")}
            </CardTitle>
            <CardDescription>{t("create.description")}</CardDescription>
          </CardHeader>
          <CreateOrganizationForm />
        </Card>
      </div>
    </>
  );
}
