import type { CreateProjectInput, Permission, Project, ProjectId, TenantId, UpdateProjectInput } from "@core/contracts";
import { requirePermission } from "#/services/access/application/grant-checks.ts";
import type { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { TenancyNotFoundError } from "../../domain/errors/tenancy-not-found-error.ts";
import {
  changedKeys,
  organizationNode,
  projectNode,
  recordTenancyAudit,
  type TenancyCommand,
  type TenancyDeps,
} from "../tenancy-deps.ts";

export type ProjectError = AccessDeniedError | TenancyNotFoundError;

type ProjectCommand = Omit<TenancyCommand, "requestId"> & { readonly projectId: ProjectId };

/** Loads a live project, then authorizes `permission` at it; the node names the project's tenant. */
export const loadAuthorizedProject = async (
  deps: Pick<TenancyDeps, "projects">,
  command: ProjectCommand & { readonly permission: Permission },
): Promise<Result<Project, ProjectError>> => {
  const project = await deps.projects.get(undefined, command.projectId);
  if (project === null) return err(new TenancyNotFoundError("project"));
  const allowed = await requirePermission({ ...command, node: projectNode(project) });
  return allowed.ok ? ok(project) : allowed;
};

export type CreateProjectCommand = TenancyCommand & { readonly tenantId: TenantId; readonly input: CreateProjectInput };

/** Creates a project (`core.project.create` at the organization). */
export const makeCreateProject =
  (deps: TenancyDeps) =>
  async (command: CreateProjectCommand): Promise<Result<Project, AccessDeniedError>> => {
    const allowed = await requirePermission({
      ...command,
      permission: "core.project.create",
      node: organizationNode(command.tenantId),
    });
    if (!allowed.ok) return allowed;
    const now = deps.clock.now().toISOString();
    const { name, description, settings } = command.input;
    const project: Project = {
      id: deps.projects.newId(),
      tenantId: command.tenantId,
      name,
      ...(description === undefined ? {} : { description }),
      status: "active",
      settings: { ...settings },
      createdAt: now,
      updatedAt: now,
    };
    await deps.unitOfWork.run(async (tx) => {
      deps.projects.create(tx, { project, actorId: auditActorOf(command.actor).id });
      await recordTenancyAudit(tx, deps, command, {
        tenantId: project.tenantId,
        action: "PROJECT_CREATED",
        target: { type: "project", id: project.id },
        node: projectNode(project),
      });
    });
    return ok(project);
  };

/** Reads a project (`core.project.read` at the project). */
export const makeGetProject =
  (deps: Pick<TenancyDeps, "projects">) =>
  (command: ProjectCommand): Promise<Result<Project, ProjectError>> =>
    loadAuthorizedProject(deps, { ...command, permission: "core.project.read" });

// `null` clears an optional value (inherit again / no description).
const applyProjectPatch = (project: Project, input: UpdateProjectInput, now: string): Project => {
  const settings = { ...project.settings };
  for (const key of ["timeZone", "currency"] as const) {
    const value = input.settings?.[key];
    if (value === null) delete settings[key];
    else if (value !== undefined) Object.assign(settings, { [key]: value });
  }
  const next: Project = {
    ...project,
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.status === undefined ? {} : { status: input.status }),
    settings,
    updatedAt: now,
  };
  if (input.description === null) delete next.description;
  else if (input.description !== undefined) next.description = input.description;
  return next;
};

/** Changes a project (`core.project.update`). */
export const makeUpdateProject =
  (deps: TenancyDeps) =>
  async (
    command: ProjectCommand & TenancyCommand & { readonly input: UpdateProjectInput },
  ): Promise<Result<Project, ProjectError>> => {
    const loaded = await loadAuthorizedProject(deps, { ...command, permission: "core.project.update" });
    if (!loaded.ok) return loaded;
    const next = applyProjectPatch(loaded.data, command.input, deps.clock.now().toISOString());
    await deps.unitOfWork.run(async (tx) => {
      deps.projects.update(tx, { project: next, actorId: auditActorOf(command.actor).id });
      await recordTenancyAudit(tx, deps, command, {
        tenantId: next.tenantId,
        action: "PROJECT_UPDATED",
        target: { type: "project", id: next.id },
        node: projectNode(next),
        changes: changedKeys(command.input),
      });
    });
    return ok(next);
  };

// Units per round of a project delete; each round is one query and one batch.
const CASCADE_ROUND = 400;

/**
 * Soft-deletes every live unit of a project, in rounds, before the project itself
 * (decision 0030 §3): Security Rules read units without their project, so none may outlive
 * it. An interrupted delete leaves the project live and a retry finishes the units.
 */
const cascadeUnits = async (
  deps: Pick<TenancyDeps, "units">,
  args: { projectId: ProjectId; deletedAt: string; actorId: string },
): Promise<void> => {
  for (;;) {
    const units = await deps.units.listOfProject({ projectId: args.projectId, limit: CASCADE_ROUND });
    if (units.length === 0) return;
    await deps.units.softDeleteMany({
      ids: units.map((unit) => unit.id),
      deletedAt: args.deletedAt,
      actorId: args.actorId,
    });
  }
};

/** Soft-deletes a project and, first, every unit of it (`core.project.delete`). */
export const makeDeleteProject =
  (deps: TenancyDeps) =>
  async (command: ProjectCommand & TenancyCommand): Promise<Result<void, ProjectError>> => {
    const loaded = await loadAuthorizedProject(deps, { ...command, permission: "core.project.delete" });
    if (!loaded.ok) return loaded;
    const project = loaded.data;
    const deletedAt = deps.clock.now().toISOString();
    const actorId = auditActorOf(command.actor).id;
    await cascadeUnits(deps, { projectId: project.id, deletedAt, actorId });
    await deps.unitOfWork.run(async (tx) => {
      deps.projects.softDelete(tx, { id: project.id, deletedAt, actorId });
      await recordTenancyAudit(tx, deps, command, {
        tenantId: project.tenantId,
        action: "PROJECT_DELETED",
        target: { type: "project", id: project.id },
        node: projectNode(project),
      });
    });
    return ok(undefined);
  };
