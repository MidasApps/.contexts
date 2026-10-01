"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { useProject, type TenantNodeInput } from "#/entities/project/index.ts";
import { unitQuery } from "#/entities/unit/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";

function UnitName({ organizationId, unitId }: { organizationId: string; unitId: string }) {
  const t = useTranslations("settings.nodes");
  const callEndpoint = useCallEndpoint();
  const unit = useQuery({ ...unitQuery(callEndpoint, { organizationId, unitId }), enabled: useIsSignedIn() });
  if (unit.isPending) return <Skeleton className="inline-block h-3.5 w-20 align-middle" />;
  return <>{unit.data?.name ?? t("hiddenUnit")}</>;
}

function ProjectName({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const t = useTranslations("settings.nodes");
  const project = useProject({ organizationId, projectId });
  if (project.isPending) return <Skeleton className="inline-block h-3.5 w-20 align-middle" />;
  return <>{project.data?.name ?? t("hiddenProject")}</>;
}

/**
 * Where a grant, invitation, key or device applies (SP1 spec §5.2), in words: the whole
 * organization, a project or a unit (with an icon, so the level is not told by text only).
 * Names the viewer cannot see render as "hidden project/unit", never as raw ids.
 */
export function NodeName({ node }: { node: TenantNodeInput }) {
  const t = useTranslations("settings.nodes");
  if (node.level === "organization") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Icon name="building" className="size-3.5 text-muted-foreground" />
        {t("organizationLevel")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon name={node.level === "project" ? "folder" : "network"} className="size-3.5 text-muted-foreground" />
      <span className="sr-only">{t(node.level === "project" ? "projectLevel" : "unitLevel")}</span>
      {node.level === "project" ? <ProjectName organizationId={node.tenantId} projectId={node.projectId} /> : <UnitName organizationId={node.tenantId} unitId={node.unitId} />}
    </span>
  );
}
