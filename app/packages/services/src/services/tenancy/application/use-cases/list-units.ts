import type { ProjectId, Unit, UnitId } from "@core/contracts";
import type { DenyReason } from "#/services/access/domain/authorization.ts";
import { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { type TenancyCommand, type TenancyDeps, unitNode } from "../tenancy-deps.ts";
import { loadTreeParent, type UnitError } from "./unit-access.ts";

export type ListUnitsCommand = Omit<TenancyCommand, "requestId"> & {
  readonly projectId: ProjectId;
  readonly parentUnitId: UnitId | null;
  readonly page: PageRequest;
};

export type ListUnits = (command: ListUnitsCommand) => Promise<Result<Page<Unit>, UnitError>>;

const NARROWABLE: ReadonlySet<DenyReason> = new Set(["NOT_A_MEMBER", "PERMISSION_NOT_GRANTED"]);

/**
 * Lists the children of the project root or of a unit (`core.unit.read`), by name. A
 * caller who cannot read the parent sees only the children it holds grants on (a
 * sibling grant sees nothing); the page cursor still follows the unfiltered order.
 */
export const makeListUnits =
  (deps: TenancyDeps): ListUnits =>
  async (command) => {
    const parent = await loadTreeParent(deps, command);
    if (!parent.ok) return parent;
    const decision = await command.access.authorize({
      principal: command.actor,
      permission: "core.unit.read",
      node: parent.data.node,
    });
    if (!decision.allowed && !NARROWABLE.has(decision.reason)) return err(new AccessDeniedError(decision.reason));
    const page = await deps.units.listChildren({
      projectId: command.projectId,
      parentUnitId: command.parentUnitId,
      page: command.page,
    });
    if (decision.allowed) return ok(page);
    const decisions = await Promise.all(
      page.items.map((unit) =>
        command.access.authorize({ principal: command.actor, permission: "core.unit.read", node: unitNode(unit) }),
      ),
    );
    const items = page.items.filter((_, index) => decisions[index]?.allowed === true);
    if (items.length === 0 && command.page.after === undefined) return err(new AccessDeniedError(decision.reason));
    return ok({ items, nextCursor: page.nextCursor });
  };
