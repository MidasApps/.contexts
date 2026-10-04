"use client";

import type { TenantNodeRefSchema } from "@core/contracts";
import { useMemo } from "react";
import { useTranslations } from "use-intl";
import type { z } from "zod";
import type { ComboboxGroup } from "#/shared/ui/molecules/Combobox/Combobox.tsx";
import { useProjects } from "../api/project-queries.ts";

/** A tenant node as the client sends it (ids unbranded: the API parses and brands them). */
export type TenantNodeInput = z.input<typeof TenantNodeRefSchema>;

/** Stable select value of a node: `organization`, `project:<id>`, `unit:<projectId>:<unitId>`. */
export const nodeOptionValue = (node: TenantNodeInput): string => {
  if (node.level === "organization") return "organization";
  if (node.level === "project") return `project:${node.projectId}`;
  return `unit:${node.projectId}:${node.unitId}`;
};

/** The node a select value names inside `organizationId`, or `null` for an unknown value. */
export const nodeFromOptionValue = (organizationId: string, value: string): TenantNodeInput | null => {
  if (value === "organization") return { level: "organization", tenantId: organizationId };
  const [level, projectId, unitId] = value.split(":");
  if (level === "project" && projectId !== undefined && projectId !== "")
    return { level: "project", tenantId: organizationId, projectId };
  if (level === "unit" && projectId !== undefined && unitId !== undefined && unitId !== "") {
    return { level: "unit", tenantId: organizationId, projectId, unitId };
  }
  return null;
};

export type NodeOptions = {
  readonly groups: readonly ComboboxGroup[];
  readonly loading: boolean;
  /** The visible projects did not load: only the organization can be picked. */
  readonly failed: boolean;
};

/**
 * Grant targets for pickers (invitations, grants, device activations, API keys): the
 * organization and every visible project (SP1 spec §5.2 nodes). Units are granted from the units
 * page, where the tree is loaded.
 */
export const useNodeOptions = (organization: { id: string; name: string }): NodeOptions => {
  const t = useTranslations("settings.nodes");
  const projects = useProjects(organization.id);
  const groups = useMemo((): ComboboxGroup[] => {
    const organizationGroup: ComboboxGroup = {
      heading: t("organizationGroup"),
      options: [
        {
          value: "organization",
          label: t("wholeOrganization", { name: organization.name }),
          keywords: [organization.name],
        },
      ],
    };
    const projectOptions = (projects.data ?? []).map((project) => ({
      value: `project:${project.id}`,
      label: project.name,
    }));
    return projectOptions.length === 0
      ? [organizationGroup]
      : [organizationGroup, { heading: t("projectGroup"), options: projectOptions }];
  }, [organization.name, projects.data, t]);
  return { groups, loading: projects.isPending, failed: projects.isError };
};
