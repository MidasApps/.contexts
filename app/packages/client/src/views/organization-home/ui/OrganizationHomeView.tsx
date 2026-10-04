"use client";

import type { AccessContext, Project } from "@core/contracts";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { useProjects } from "#/entities/project/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { CreateProjectDialog } from "#/features/create-project/index.ts";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { PageError, PageNotFound, QueryPage } from "#/widgets/page-state/index.ts";

function ProjectCard({ organizationId, project }: { organizationId: string; project: Project }) {
  const t = useTranslations("shell.organizationHome");
  return (
    <RouteLink
      to={{ id: "project", organizationId, projectId: project.id }}
      className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-[18px] transition-colors hover:bg-accent focus-visible:-outline-offset-2"
    >
      <span className="flex items-center gap-2">
        <Icon name="folder" className="size-4 text-muted-foreground" />
        <span className="truncate text-title font-semibold">{project.name}</span>
        {project.status === "archived" ? (
          <StatusPill tone="neutral" className="ml-auto">
            {t("archived")}
          </StatusPill>
        ) : null}
      </span>
      {project.description === undefined || project.description === "" ? null : (
        <span className="line-clamp-2 text-body text-muted-foreground">{project.description}</span>
      )}
    </RouteLink>
  );
}

function ProjectsSkeleton() {
  const t = useTranslations("shell.organizationHome");
  return (
    <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <span className="sr-only">{t("loadingProjects")}</span>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

function ProjectsSection({
  organizationId,
  canCreate,
  onCreate,
}: {
  organizationId: string;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const t = useTranslations("shell.organizationHome");
  const projects = useProjects(organizationId);
  if (projects.isPending) return <ProjectsSkeleton />;
  if (projects.isError)
    return (
      <ApiErrorState error={projects.error} onRetry={() => void projects.refetch()} retrying={projects.isFetching} />
    );
  if (projects.data.length === 0) {
    return (
      <EmptyState
        icon="folder"
        title={t("emptyTitle")}
        description={canCreate ? t("emptyDescription") : t("emptyDescriptionNoPermission")}
        action={
          canCreate ? (
            <Button onClick={onCreate}>
              <Icon name="plus" />
              {t("createProject")}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t("projectsHeading")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.data.map((project) => (
          <li key={project.id}>
            <ProjectCard organizationId={organizationId} project={project} />
          </li>
        ))}
      </ul>
      {projects.hasNextPage ? (
        <Button
          variant="outline"
          className="self-start"
          pending={projects.isFetchingNextPage}
          onClick={() => void projects.fetchNextPage()}
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}

function OrganizationHome({ context }: { context: AccessContext }) {
  const t = useTranslations("shell.organizationHome");
  const [creating, setCreating] = useState(false);
  const { organization } = context;
  const canCreate = context.permissions.includes("core.project.create");
  return (
    <>
      <PageHeader
        title={organization.name}
        description={t("description")}
        meta={organization.status === "suspended" ? <StatusPill tone="amber">{t("suspended")}</StatusPill> : undefined}
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" />
              {t("createProject")}
            </Button>
          ) : undefined
        }
      />
      <section aria-labelledby="organization-projects-heading" className="flex flex-col gap-3">
        <h2 id="organization-projects-heading" className="text-sm font-semibold">
          {t("projectsHeading")}
        </h2>
        <ProjectsSection organizationId={organization.id} canCreate={canCreate} onCreate={() => setCreating(true)} />
      </section>
      {canCreate ? (
        <CreateProjectDialog organizationId={organization.id} open={creating} onOpenChange={setCreating} />
      ) : null}
    </>
  );
}

/**
 * A member whose grants sit only on projects (decision 0030 A5) can switch to the organization but
 * gets 404 from its organization-level context: take them to their first visible project instead
 * of a not-found page (`replace`, so Back does not bounce). No visible project → not-found.
 */
function EntryProjectRedirect({ organizationId }: { organizationId: string }) {
  const t = useTranslations("shell.organizationHome");
  const router = useRouter();
  const projects = useProjects(organizationId);
  const firstProjectId = projects.data?.[0]?.id;
  useEffect(() => {
    if (firstProjectId !== undefined)
      router.navigate({ id: "project", organizationId, projectId: firstProjectId }, { replace: true });
  }, [firstProjectId, organizationId, router]);
  if (projects.isPending || firstProjectId !== undefined) return <LoadingState label={t("loading")} rows={5} />;
  if (projects.isError && !isApiErrorStatus(projects.error, 404))
    return <PageError error={projects.error} onRetry={() => void projects.refetch()} retrying={projects.isFetching} />;
  return <PageNotFound />;
}

/**
 * `/o/:organizationId` (SP2 spec §4, `core.organization.read`): the organization's projects as
 * cards, "New project" when `core.project.create` is held. A hidden organization renders
 * not-found, unless the member sees a project in it (then they land there); loading, empty and
 * error states come with the list.
 */
export function OrganizationHomeView() {
  const t = useTranslations("shell.organizationHome");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  if (node !== null && context.status === "error" && isApiErrorStatus(context.error, 404))
    return <EntryProjectRedirect organizationId={node.organizationId} />;
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <OrganizationHome context={data} />}
    </QueryPage>
  );
}
