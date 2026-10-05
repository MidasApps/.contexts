"use client";

import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { UnitBreadcrumb, useUnitPath, useUnits } from "#/entities/unit/index.ts";
import { ProjectActionsMenu } from "#/features/manage-project/index.ts";
import type { NodeParams } from "#/shared/api/core-queries.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "#/shared/ui/atoms/Card/Card.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";

type ProjectContext = AccessContext & { project: NonNullable<AccessContext["project"]> };

function UnitsSection({ context, node }: { context: ProjectContext; node: NodeParams & { projectId: string } }) {
  const t = useTranslations("shell.projectHome");
  const units = useUnits({
    organizationId: node.organizationId,
    projectId: node.projectId,
    parentUnitId: context.unit?.id,
  });
  const canManage = context.permissions.includes("core.unit.create");
  const settings = canManage ? (
    <Button variant="secondary" asChild>
      <RouteLink to={{ id: "settings", organizationId: node.organizationId, section: "units" }}>
        {t("manageUnits")}
      </RouteLink>
    </Button>
  ) : undefined;
  if (units.isPending) return <LoadingState label={t("loadingUnits")} rows={3} />;
  if (units.isError)
    return (
      <ApiErrorState
        error={units.error}
        headingLevel={3}
        onRetry={() => void units.refetch()}
        retrying={units.isFetching}
      />
    );
  if (units.data.length === 0)
    return (
      <EmptyState
        icon="network"
        headingLevel={3}
        title={t("unitsEmptyTitle")}
        description={t("unitsEmptyDescription")}
        action={settings}
      />
    );
  return (
    <ul aria-label={t("unitsHeading")} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {units.data.map((unit) => (
        <li key={unit.id}>
          <RouteLink
            to={{ id: "project", organizationId: node.organizationId, projectId: node.projectId, unit: unit.id }}
            className="flex min-h-12 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:-outline-offset-2"
          >
            <Icon name="network" className="size-4 text-muted-foreground" />
            <span className="truncate font-medium">{unit.name}</span>
            <Icon name="chevron-right" className="ml-auto size-4 text-muted-foreground" />
          </RouteLink>
        </li>
      ))}
    </ul>
  );
}

function ModulesSection({ context, node }: { context: ProjectContext; node: NodeParams }) {
  const t = useTranslations();
  const granted = new Set<string>(context.permissions);
  const entries = useNavigationRegistry()
    .visibleItems("project", (permission) => granted.has(permission))
    .filter((item) => item.target.kind === "module")
    .flatMap((item) => {
      const route = navItemRoute(item.target, node);
      return route === null ? [] : [{ item, route }];
    });
  if (entries.length === 0)
    return (
      <EmptyState
        icon="puzzle"
        headingLevel={3}
        title={t("shell.projectHome.modulesEmptyTitle")}
        description={t("shell.projectHome.modulesEmptyDescription")}
      />
    );
  return (
    <ul aria-label={t("shell.projectHome.modulesHeading")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map(({ item, route }) => (
        <li key={item.id}>
          <Card className="relative h-full transition-colors hover:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-ring">
            <CardHeader>
              <CardTitle as="h3" className="flex items-center gap-2">
                <Icon name={item.icon} className="size-4 text-muted-foreground" />
                <RouteLink to={route} className="after:absolute after:inset-0 focus-visible:outline-none">
                  {t(item.labelKey)}
                </RouteLink>
              </CardTitle>
              <CardDescription>{t("shell.projectHome.openModule")}</CardDescription>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ProjectHome({ context, node }: { context: ProjectContext; node: NodeParams & { projectId: string } }) {
  const t = useTranslations("shell.projectHome");
  const unitPath = useUnitPath(node.organizationId, context.unit);
  const { project } = context;
  return (
    <>
      <PageHeader
        eyebrow={context.organization.name}
        title={project.name}
        description={project.description === undefined || project.description === "" ? undefined : project.description}
        meta={project.status === "archived" ? <StatusPill tone="neutral">{t("archived")}</StatusPill> : undefined}
        actions={
          <ProjectActionsMenu
            project={project}
            canUpdate={context.permissions.includes("core.project.update")}
            canDelete={context.permissions.includes("core.project.delete")}
          />
        }
      />
      {context.unit === undefined ? null : (
        <p className="-mt-3 mb-6 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("currentUnit")}</span>
          <UnitBreadcrumb path={unitPath} />
        </p>
      )}
      <div className="flex flex-col gap-8">
        {context.permissions.includes("core.unit.read") ? (
          <section aria-labelledby="project-units-heading" className="flex flex-col gap-3">
            <h2 id="project-units-heading" className="text-sm font-semibold">
              {context.unit === undefined ? t("unitsHeading") : t("subunitsHeading")}
            </h2>
            <UnitsSection context={context} node={node} />
          </section>
        ) : null}
        <section aria-labelledby="project-modules-heading" className="flex flex-col gap-3">
          <h2 id="project-modules-heading" className="text-sm font-semibold">
            {t("modulesHeading")}
          </h2>
          <ModulesSection context={context} node={node} />
        </section>
      </div>
    </>
  );
}

const hasProject = (context: AccessContext): context is ProjectContext => context.project !== undefined;

/**
 * `/o/:organizationId/p/:projectId?unit=` (SP2 spec §4, `core.project.read`): project overview —
 * name, description and status, the units at the current level (links set `?unit=`) and the
 * entry points of the modules the viewer may open here. "Project settings" edits, archives or
 * deletes the project (core.project.update / core.project.delete at it).
 */
export function ProjectHomeView() {
  const t = useTranslations("shell.projectHome");
  const node = useCurrentNode();
  const context = useAccessContext(node);
  const projectNode = node?.projectId === undefined ? null : { ...node, projectId: node.projectId };
  return (
    <QueryPage
      query={{
        ...context,
        data: context.data === undefined ? undefined : hasProject(context.data) ? context.data : null,
      }}
      loadingLabel={t("loading")}
    >
      {(data) => (projectNode === null ? null : <ProjectHome context={data} node={projectNode} />)}
    </QueryPage>
  );
}
