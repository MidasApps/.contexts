import type { NodeRef, Permission, PermissionDefinition, TenantNodeRef } from "@core/contracts";
import { type AuthorizeDecision, deny } from "../../domain/authorization.ts";
import { loadPlatformAccess } from "../platform-access.ts";
import type { Authorize, AuthorizeRequest } from "../ports/driving/authorize.ts";
import { type AccessDeps, loadTenantAccess } from "../tenant-access.ts";

const allow = (
  definition: PermissionDefinition,
  grantedVia: Extract<AuthorizeDecision, { allowed: true }>["grantedVia"],
): AuthorizeDecision => ({
  allowed: true,
  requiresApproval: definition.requiresApproval ?? false,
  grantedVia,
});

const excludedByCeiling = (permission: Permission, ceiling: ReadonlySet<Permission> | undefined): boolean =>
  ceiling !== undefined && !ceiling.has(permission);

const authorizePlatform = async (
  request: AuthorizeRequest,
  definition: PermissionDefinition,
  deps: AccessDeps,
): Promise<AuthorizeDecision> => {
  const access = await loadPlatformAccess(request.principal, deps);
  if (!access.ok) return deny(access.reason);
  if (!access.permissions.has(request.permission)) return deny("PERMISSION_NOT_GRANTED");
  if (request.principal.type !== "user" || !request.principal.mfa) return deny("MFA_REQUIRED");
  if (excludedByCeiling(request.permission, request.ceiling)) return deny("CEILING_EXCLUDES");
  return allow(definition, [{ kind: "platform-role", role: access.role }]);
};

const authorizeTenant = async (
  request: AuthorizeRequest & { node: TenantNodeRef },
  definition: PermissionDefinition,
  deps: AccessDeps,
): Promise<AuthorizeDecision> => {
  const access = await loadTenantAccess({
    principal: request.principal,
    node: request.node,
    deps,
    precheck: (subject) => {
      if (subject.readOnly && definition.kind !== "read") return "IMPERSONATION_READ_ONLY";
      return subject.scopes !== undefined && !subject.scopes.has(request.permission) ? "OUTSIDE_KEY_SCOPE" : null;
    },
  });
  if (!access.ok) return deny(access.reason);
  const sources = access.effective.sources.get(request.permission);
  if (sources === undefined) return deny("PERMISSION_NOT_GRANTED");
  if (excludedByCeiling(request.permission, request.ceiling)) return deny("CEILING_EXCLUDES");
  return allow(definition, sources);
};

const isTenantRequest = (request: AuthorizeRequest): request is AuthorizeRequest & { node: TenantNodeRef } =>
  request.node.level !== "platform";

// Step 1 (SP1 spec §5.2): registered permission, and platform scope ↔ platform node.
const checkPermission = (
  request: { permission: Permission; node: NodeRef },
  deps: AccessDeps,
): PermissionDefinition | "UNKNOWN_PERMISSION" | "SCOPE_MISMATCH" => {
  const definition = deps.registry.get(request.permission);
  if (definition === undefined) return "UNKNOWN_PERMISSION";
  return (definition.scope === "platform") === (request.node.level === "platform") ? definition : "SCOPE_MISMATCH";
};

/**
 * Creates `authorize()` (SP1 spec §5.2), the only access decision function.
 * Fail-closed: every step denies on failure, and a reader error rejects the promise
 * (the route boundary answers 500). Give it request-scoped readers
 * (`createRequestScope`) so reads are memoized per request only.
 * @example
 *   const authorize = makeAuthorize({ registry, readers: createRequestScope(readers), clock });
 *   const decision = await authorize({ principal, permission: "core.project.read", node });
 */
export const makeAuthorize =
  (deps: AccessDeps): Authorize =>
  async (request) => {
    const checked = checkPermission(request, deps);
    if (typeof checked === "string") return deny(checked);
    return isTenantRequest(request)
      ? authorizeTenant(request, checked, deps)
      : authorizePlatform(request, checked, deps);
  };
