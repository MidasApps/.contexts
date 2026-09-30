/** A role or membership does not exist or was deleted → 404 NOT_FOUND. */
export class AccessNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly resource: "role" | "membership";

  constructor(resource: "role" | "membership", options?: ErrorOptions) {
    super(`${resource} not found`, options);
    this.name = "AccessNotFoundError";
    this.resource = resource;
  }
}
