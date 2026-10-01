"use client";

import { useState } from "react";
import { useTranslations } from "use-intl";
import { useCan } from "#/entities/permission/index.ts";
import { useProjects } from "#/entities/project/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { CreateProjectDialog } from "#/features/create-project/index.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/shared/ui/molecules/DropdownMenu/DropdownMenu.tsx";
import { useSidebar } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "#/shared/ui/organisms/Sidebar/sidebar-menu.tsx";

function ProjectItems({ organizationId, currentId }: { organizationId: string; currentId: string | undefined }) {
  const t = useTranslations("shell.switcher");
  const router = useRouter();
  const projects = useProjects(organizationId);
  if (projects.isPending) {
    return (
      <DropdownMenuItem disabled>
        <Spinner decorative />
        {t("loadingProjects")}
      </DropdownMenuItem>
    );
  }
  if (projects.isError) {
    return (
      <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void projects.refetch(); }}>
        <Icon name="refresh" />
        {t("projectsFailed")}
      </DropdownMenuItem>
    );
  }
  if (projects.data.length === 0) return <DropdownMenuItem disabled>{t("noProjects")}</DropdownMenuItem>;
  return (
    <DropdownMenuRadioGroup value={currentId ?? ""} onValueChange={(projectId) => router.navigate({ id: "project", organizationId, projectId })}>
      {projects.data.map((project) => (
        <DropdownMenuRadioItem key={project.id} value={project.id}>
          <span className="truncate">{project.name}</span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/**
 * Project switcher under the organization (sidebar-07 "projects"): the current project, the
 * visible projects as a radio group, "New project" when `core.project.create` is held at the
 * organization, and a link to all projects. Hidden outside an organization.
 */
export function ProjectSwitcher() {
  const t = useTranslations("shell.switcher");
  const { isMobile } = useSidebar();
  const node = useCurrentNode();
  const context = useAccessContext(node);
  const canCreate = useCan("core.project.create", node === null ? null : { organizationId: node.organizationId });
  const [creating, setCreating] = useState(false);
  if (node === null) return null;
  const project = node.projectId === undefined ? undefined : context.data?.project;
  const name = project?.name ?? t("chooseProject");
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={name} aria-label={t("projectTrigger", { name })} className="data-[state=open]:bg-sidebar-accent">
              <Icon name="folder" />
              {node.projectId !== undefined && context.isPending ? <Skeleton className="h-4 w-24" /> : <span className="truncate">{name}</span>}
              <Icon name="chevron-down" className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="start" sideOffset={4} className="min-w-56">
            <DropdownMenuLabel>{t("projects")}</DropdownMenuLabel>
            <ProjectItems organizationId={node.organizationId} currentId={node.projectId} />
            <DropdownMenuSeparator />
            {canCreate ? (
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Icon name="plus" />
                {t("createProject")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <RouteLink to={{ id: "organization", organizationId: node.organizationId }}>
                <Icon name="list" />
                {t("allProjects")}
              </RouteLink>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CreateProjectDialog organizationId={node.organizationId} open={creating} onOpenChange={setCreating} />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
