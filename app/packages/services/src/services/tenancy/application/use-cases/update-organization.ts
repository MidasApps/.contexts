import type { Organization, UpdateOrganizationInput } from "@core/contracts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { TenancyNotFoundError } from "../../domain/errors/tenancy-not-found-error.ts";
import {
  changedKeys,
  organizationNode,
  recordTenancyAudit,
  type TenancyCommand,
  type TenancyDeps,
} from "../tenancy-deps.ts";
import { type LoadError, loadAuthorizedOrganization, type OrganizationCommand } from "./get-organization.ts";

export type UpdateOrganizationCommand = OrganizationCommand &
  TenancyCommand & { readonly input: UpdateOrganizationInput };

export type UpdateOrganization = (command: UpdateOrganizationCommand) => Promise<Result<Organization, LoadError>>;

/** Changes the name or regional defaults (`core.organization.update`); absent keys keep their value. */
export const makeUpdateOrganization =
  (deps: TenancyDeps): UpdateOrganization =>
  async (command) => {
    const loaded = await loadAuthorizedOrganization(deps, { ...command, permission: "core.organization.update" });
    if (!loaded.ok) return loaded;
    return deps.unitOfWork.run(async (tx): Promise<Result<Organization, LoadError>> => {
      const current = await deps.organizations.get(tx, command.organizationId);
      if (current === null) return err(new TenancyNotFoundError("organization"));
      const { name, defaults } = command.input;
      const next: Organization = {
        ...current,
        ...(name === undefined ? {} : { name }),
        defaults: {
          locale: defaults?.locale ?? current.defaults.locale,
          timeZone: defaults?.timeZone ?? current.defaults.timeZone,
          currency: defaults?.currency ?? current.defaults.currency,
        },
        updatedAt: deps.clock.now().toISOString(),
      };
      deps.organizations.update(tx, { organization: next, actorId: auditActorOf(command.actor).id });
      await recordTenancyAudit(tx, deps, command, {
        tenantId: current.tenantId,
        action: "ORGANIZATION_UPDATED",
        target: { type: "organization", id: current.id },
        node: organizationNode(current.tenantId),
        changes: changedKeys(command.input),
      });
      return ok(next);
    });
  };
