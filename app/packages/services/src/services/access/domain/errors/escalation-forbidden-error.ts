import type { Permission } from "@core/contracts";

/**
 * The requested roles, scopes or permissions exceed what the actor holds at the node
 * (SP1 spec §5.3) → 403 ESCALATION_FORBIDDEN. `missing` is logged, never returned.
 */
export class EscalationForbiddenError extends Error {
  readonly code = "ESCALATION_FORBIDDEN";
  readonly missing: readonly Permission[];

  constructor(missing: readonly Permission[], options?: ErrorOptions) {
    super("the request grants permissions the actor does not hold", options);
    this.name = "EscalationForbiddenError";
    this.missing = missing;
  }
}
