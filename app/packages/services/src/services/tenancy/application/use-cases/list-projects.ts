import type { Project, TenantId } from "@core/contracts";
import type { DenyReason } from "../../../access/domain/authorization.ts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { type Page, type PageRequest, paginateInMemory } from "../../../shared/pagination/page.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import {
  organizationNode,
  projectionPrincipalIdOf,
  projectNode,
  type TenancyCommand,
  type TenancyDeps,
} from "../tenancy-deps.ts";

export type ListProjectsCommand = Omit<TenancyCommand, "requestId"> & {
  readonly tenantId: TenantId;
  readonly page: PageRequest;
};

export type ListProjects = (command: ListProjectsCommand) => Promise<Result<Page<Project>, AccessDeniedError>>;

// A caller without an organization-wide read may still see the projects it has grants in.
const NARROWABLE: ReadonlySet<DenyReason> = new Set(["NOT_A_MEMBER", "PERMISSION_NOT_GRANTED"]);

const visibleProjects = async (deps: TenancyDeps, command: ListProjectsCommand): Promise<Project[]> => {
  const projection = await deps.access.projections.get(undefined, {
    tenantId: command.tenantId,
    principalId: projectionPrincipalIdOf(command.actor),
  });
  if (projection === null || projection.isRevoked || projection.visibleProjectIds.length === 0) return [];
  const candidates = await deps.projects.getMany({ tenantId: command.tenantId, ids: projection.visibleProjectIds });
  // The projection only narrows the candidates; authorize() decides from the source.
  const decisions = await Promise.all(
    candidates.map((project) =>
      command.access.authorize({
        principal: command.actor,
        permission: "core.project.read",
        node: projectNode(project),
      }),
    ),
  );
  return candidates.filter((_, index) => decisions[index]?.allowed === true);
};

/**
 * Lists the projects of an organization the caller can see (`core.project.read`), by
 * name: every project with an organization-wide read, else the projects of its access
 * projection that `authorize()` confirms. Nothing visible and no membership → denied.
 */
export const makeListProjects =
  (deps: TenancyDeps): ListProjects =>
  async (command) => {
    const decision = await command.access.authorize({
      principal: command.actor,
      permission: "core.project.read",
      node: organizationNode(command.tenantId),
    });
    if (decision.allowed) return ok(await deps.projects.list({ tenantId: command.tenantId, page: command.page }));
    if (!NARROWABLE.has(decision.reason)) return err(new AccessDeniedError(decision.reason));
    const visible = await visibleProjects(deps, command);
    if (visible.length === 0 && decision.reason === "NOT_A_MEMBER") return err(new AccessDeniedError("NOT_A_MEMBER"));
    return ok(
      paginateInMemory({ items: visible, page: command.page, positionOf: (project) => [project.name, project.id] }),
    );
  };
