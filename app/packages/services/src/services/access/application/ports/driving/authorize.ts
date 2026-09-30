import type { NodeRef, Permission, Principal } from "@core/contracts";
import type { AuthorizeDecision, DenyReason } from "../../../domain/authorization.ts";

export type AuthorizeRequest = {
  readonly principal: Principal;
  readonly permission: Permission;
  readonly node: NodeRef;
  /** Agent permission ceiling (SP3): effective = principal's ∩ ceiling. */
  readonly ceiling?: ReadonlySet<Permission> | undefined;
};

/**
 * The only access decision function (SP1 spec §5.2): fail-closed, reads the source
 * of truth, memoized per request. A reader error rejects the promise (never allows).
 */
export type Authorize = (request: AuthorizeRequest) => Promise<AuthorizeDecision>;

export type EffectivePermissionsRequest = {
  readonly principal: Principal;
  readonly node: NodeRef;
  readonly ceiling?: ReadonlySet<Permission> | undefined;
};

export type EffectivePermissionsResult =
  | { readonly ok: true; readonly permissions: ReadonlySet<Permission> }
  | { readonly ok: false; readonly reason: DenyReason };

/** Read model of `authorize()`: every permission the principal holds at a node (UI, SP3). */
export type GetEffectivePermissions = (request: EffectivePermissionsRequest) => Promise<EffectivePermissionsResult>;
