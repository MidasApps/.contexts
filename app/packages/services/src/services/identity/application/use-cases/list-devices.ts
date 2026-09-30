import type { Device, TenantId, UserPrincipal } from "@core/contracts";
import { requirePermission } from "../../../access/application/grant-checks.ts";
import type { RequestAccess } from "../../../access/composition.ts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { DeviceDeps } from "../device-deps.ts";

export type ListDevices = (command: { actor: UserPrincipal; access: RequestAccess; tenantId: TenantId; page: PageRequest }) => Promise<Result<Page<Device>, AccessDeniedError>>;

/** `GET /v1/organizations/{organizationId}/devices` (`core.device.read`), newest first. */
export const makeListDevices =
  (deps: DeviceDeps): ListDevices =>
  async ({ actor, access, tenantId, page }) => {
    const allowed = await requirePermission({ access, actor, permission: "core.device.read", node: { level: "organization", tenantId } });
    if (!allowed.ok) return allowed;
    return ok(await deps.devices.list({ tenantId, page }));
  };
