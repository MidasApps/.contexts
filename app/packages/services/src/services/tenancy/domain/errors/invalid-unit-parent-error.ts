/** Why a unit cannot sit under the requested parent. */
export type InvalidUnitParentReason = "UNKNOWN_TYPE" | "TYPE_NOT_ALLOWED" | "PARENT_NOT_FOUND" | "CYCLE" | "TOO_DEEP";

/** The unit type does not allow the parent, the parent is not in the project, or the tree rules break → 422 INVALID_UNIT_PARENT. */
export class InvalidUnitParentError extends Error {
  readonly code = "INVALID_UNIT_PARENT";
  readonly reason: InvalidUnitParentReason;

  constructor(reason: InvalidUnitParentReason, options?: ErrorOptions) {
    super(`invalid unit parent: ${reason}`, options);
    this.name = "InvalidUnitParentError";
    this.reason = reason;
  }
}
