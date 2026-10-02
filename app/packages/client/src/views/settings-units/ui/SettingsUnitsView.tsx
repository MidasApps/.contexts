"use client";

import type { AccessContext, Project } from "@core/contracts";
import { useId } from "react";
import { useTranslations } from "use-intl";
import { useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { useProjects } from "#/entities/project/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { UnitTreeEditor } from "#/features/manage-units/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

function ProjectPicker({ projects, value, onChange }: { projects: readonly Project[]; value: string; onChange: (projectId: string) => void }) {
  const t = useTranslations("settings.units");
  const id = useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Label htmlFor={id}>{t("project")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function UnitsByProject({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.units");
  const { organization } = context;
  const projects = useProjects(organization.id);
  // The project lives in the URL (`?project=`); an unknown one falls back to the first.
  const search = useSettingsSearch(["project"]);
  const chosen = search.values.project;
  const setChosen = (next: string): void => search.set({ project: next });
  if (projects.isPending) return <LoadingState label={t("loadingProjects")} rows={3} />;
  if (projects.isError) return <ApiErrorState error={projects.error} onRetry={() => void projects.refetch()} retrying={projects.isFetching} />;
  const list = projects.data;
  const project = list.find((candidate) => candidate.id === chosen) ?? list[0];
  if (project === undefined) {
    return (
      <EmptyState
        icon="folder"
        title={t("noProjectsTitle")}
        description={t("noProjectsDescription")}
        action={
          <Button asChild>
            <RouteLink to={{ id: "organization", organizationId: organization.id }}>{t("goToProjects")}</RouteLink>
          </Button>
        }
      />
    );
  }
  const can = (permission: "core.unit.create" | "core.unit.update" | "core.unit.delete"): boolean => context.permissions.includes(permission);
  return (
    <div className="flex flex-col gap-4">
      {list.length > 1 ? <ProjectPicker projects={list} value={project.id} onChange={setChosen} /> : null}
      <SectionCard title={t("treeTitle", { project: project.name })} description={t("treeDescription")}>
        <UnitTreeEditor
          key={project.id}
          organizationId={organization.id}
          project={{ id: project.id, name: project.name }}
          can={{ create: can("core.unit.create"), update: can("core.unit.update"), delete: can("core.unit.delete") }}
        />
      </SectionCard>
    </div>
  );
}

/**
 * `/o/:organizationId/settings/units` (SP2 spec §8, core.unit.read): the unit tree of each project
 * (pick the project), with create, rename, move and delete where the viewer may.
 */
export function SettingsUnitsView() {
  const t = useTranslations("settings.units");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => (
        <SettingsPageFrame
          organizationId={data.organization.id}
          allowed={data.permissions.includes("core.unit.read")}
          header={<PageHeader eyebrow={t("eyebrow", { organization: data.organization.name })} title={t("title")} description={t("description")} />}
        >
          <UnitsByProject context={data} />
        </SettingsPageFrame>
      )}
    </QueryPage>
  );
}
