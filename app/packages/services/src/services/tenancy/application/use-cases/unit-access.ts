import type { Permission, Principal, Project, ProjectId, TenantNodeRef, Unit, UnitId } from "@core/contracts";
import { requirePermission } from "../../../access/application/grant-checks.ts";
import type { RequestAccess } from "../../../access/composition.ts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { TenancyNotFoundError } from "../../domain/errors/tenancy-not-found-error.ts";
import { projectNode, unitNode, type TenancyDeps } from "../tenancy-deps.ts";

export type UnitError = AccessDeniedError | TenancyNotFoundError;

/** A place in a project's tree: the project root (`unit: null`) or a unit. */
export type TreeParent = { readonly project: Project; readonly unit: Unit | null; readonly node: TenantNodeRef };

/** Loads a live project and, when given, a live unit of that project as a tree parent. */
export const loadTreeParent = async (
  deps: Pick<TenancyDeps, "projects" | "units">,
  args: { projectId: ProjectId; parentUnitId: UnitId | null },
): Promise<Result<TreeParent, TenancyNotFoundError>> => {
  const [project, unit] = await Promise.all([
    deps.projects.get(undefined, args.projectId),
    args.parentUnitId === null ? Promise.resolve(null) : deps.units.get(undefined, args.parentUnitId),
  ]);
  if (project === null) return err(new TenancyNotFoundError("project"));
  if (args.parentUnitId === null) return ok({ project, unit: null, node: projectNode(project) });
  if (unit?.projectId !== project.id) return err(new TenancyNotFoundError("unit"));
  return ok({ project, unit, node: unitNode(unit) });
};

/** Loads a live unit whose project is live, then authorizes `permission` at the unit. */
export const loadAuthorizedUnit = async (
  deps: Pick<TenancyDeps, "projects" | "units">,
  command: { actor: Principal; access: RequestAccess; unitId: UnitId; permission: Permission },
): Promise<Result<Unit, UnitError>> => {
  const unit = await deps.units.get(undefined, command.unitId);
  if (unit === null) return err(new TenancyNotFoundError("unit"));
  const allowed = await requirePermission({ ...command, node: unitNode(unit) });
  return allowed.ok ? ok(unit) : allowed;
};
