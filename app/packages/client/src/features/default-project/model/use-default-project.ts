"use client";

import type { Project } from "@core/contracts";
import { useProjects } from "#/entities/project/index.ts";
import { useMe } from "#/entities/session/index.ts";

/** How the shell treats an organization's projects when the server creates one with it (decision 0078). */
export type DefaultProjectMode = {
  /** `Me.organizationDefaultProject`; false while `GET /v1/me` loads. */
  readonly enabled: boolean;
  /** Not known yet: `GET /v1/me` has not answered, or the mode is on and the first page of projects has not arrived. */
  readonly pending: boolean;
  /** The viewer's only visible project: mode on, exactly one project, no further page. */
  readonly project: Project | undefined;
};

/** The default project mode of an organization: the project to open directly, when there is exactly one. */
export const useDefaultProject = (organizationId: string | undefined): DefaultProjectMode => {
  const me = useMe();
  const enabled = me.data?.organizationDefaultProject === true;
  const projects = useProjects(enabled ? organizationId : undefined);
  if (organizationId === undefined) return { enabled, pending: false, project: undefined };
  // Until the user arrives the mode is unknown: wait, so a single project is not offered as a choice first.
  // `isPending` also covers the moment before the session signs in, when the query is not running yet.
  if (me.isPending) return { enabled, pending: true, project: undefined };
  if (!enabled) return { enabled, pending: false, project: undefined };
  const only = projects.data?.length === 1 && !projects.hasNextPage ? projects.data[0] : undefined;
  return { enabled, pending: projects.isPending, project: only };
};
