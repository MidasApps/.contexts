"use client";

import { useMemo } from "react";
import { collectionOfNamespace, namespaceOfTarget, ORGANIZATION_NAMESPACE } from "#/entities/knowledge/index.ts";
import { useProjects } from "#/entities/project/index.ts";
import { useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";

/** The picker value that lists every namespace the organization can read. */
export const ALL_COLLECTIONS = "all";

/**
 * The collection being looked at, kept in the URL (`?collection=`) so a reload or a shared link
 * opens the same one, with the projects that can be picked and where an upload goes.
 */
export const useKnowledgeCollection = (organizationId: string) => {
  const search = useSettingsSearch(["collection"]);
  const selected = search.values.collection ?? ALL_COLLECTIONS;
  const all = selected === ALL_COLLECTIONS;
  const projects = useProjects(organizationId);
  const projectNames = useMemo(
    () => new Map((projects.data ?? []).map((project) => [String(project.id), project.name] as const)),
    [projects.data],
  );
  // An upload goes to the collection being looked at; "all" has no single target, so it goes to the organization.
  const collection = collectionOfNamespace(all ? ORGANIZATION_NAMESPACE : selected);
  const uploadProjectId = collection.kind === "project" ? collection.projectId : undefined;
  return {
    selected,
    setSelected: (next: string): void => search.set({ collection: next === ALL_COLLECTIONS ? undefined : next }),
    /** The namespace the list is filtered by; `undefined` lists them all. */
    namespace: all ? undefined : selected,
    projectOptions: (projects.data ?? []).map((project) => ({ id: String(project.id), name: project.name })),
    projectNames,
    /** Every project is loaded, so a project missing from `projectNames` is really gone. */
    projectsComplete: projects.isSuccess && !projects.hasNextPage,
    uploadProjectId,
    uploadNamespace: namespaceOfTarget(uploadProjectId),
  };
};
