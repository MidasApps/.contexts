/**
 * Another move or delete is rewriting the project's unit tree, or it changed the unit since
 * this request read it (decision 0030 §4) → 409 CONFLICT; the caller retries.
 */
export class UnitTreeBusyError extends Error {
  readonly code = "CONFLICT";

  constructor(options?: ErrorOptions) {
    super("the unit tree of this project is being changed", options);
    this.name = "UnitTreeBusyError";
  }
}
