/** An organization, project or unit does not exist or was deleted → 404 NOT_FOUND. */
export class TenancyNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly resource: "organization" | "project" | "unit";

  constructor(resource: "organization" | "project" | "unit", options?: ErrorOptions) {
    super(`${resource} not found`, options);
    this.name = "TenancyNotFoundError";
    this.resource = resource;
  }
}
