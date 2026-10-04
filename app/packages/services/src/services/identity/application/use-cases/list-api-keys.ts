import type { ApiKey, TenantId, UserPrincipal } from "@core/contracts";
import { requirePermission } from "#/services/access/application/grant-checks.ts";
import type { RequestAccess } from "#/services/access/composition.ts";
import type { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";
import { ok, type Result } from "#/services/shared/result/result.ts";
import type { ApiKeyDeps } from "../api-key-deps.ts";

export type ListApiKeys = (command: {
  actor: UserPrincipal;
  access: RequestAccess;
  tenantId: TenantId;
  page: PageRequest;
}) => Promise<Result<Page<ApiKey>, AccessDeniedError>>;

/** `GET /v1/organizations/{organizationId}/api-keys` (`core.api-key.read`), newest first, never secrets. */
export const makeListApiKeys =
  (deps: ApiKeyDeps): ListApiKeys =>
  async ({ actor, access, tenantId, page }) => {
    const allowed = await requirePermission({
      access,
      actor,
      permission: "core.api-key.read",
      node: { level: "organization", tenantId },
    });
    if (!allowed.ok) return allowed;
    return ok(await deps.apiKeys.list({ tenantId, page }));
  };
