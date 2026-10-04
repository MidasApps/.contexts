import type { ErrorDetail } from "@core/contracts";

/** The agent does not exist in the organization (never reveals the one of another tenant). */
export class CustomAgentNotFoundError extends Error {
  readonly code = "CUSTOM_AGENT_NOT_FOUND";

  constructor(options?: ErrorOptions) {
    super("custom agent not found", options);
    this.name = "CustomAgentNotFoundError";
  }
}

/** The skill does not exist in the organization (never reveals the one of another tenant). */
export class CustomSkillNotFoundError extends Error {
  readonly code = "CUSTOM_SKILL_NOT_FOUND";

  constructor(options?: ErrorOptions) {
    super("custom skill not found", options);
    this.name = "CustomSkillNotFoundError";
  }
}

/** The plan cap of custom agents or skills is reached (decision 0046). */
export class CustomLimitReachedError extends Error {
  readonly code = "CUSTOM_LIMIT_REACHED";
  readonly kind: "agents" | "skills";
  readonly limit: number;

  constructor(kind: "agents" | "skills", limit: number, options?: ErrorOptions) {
    super(`custom ${kind} limit reached (${limit})`, options);
    this.name = "CustomLimitReachedError";
    this.kind = kind;
    this.limit = limit;
  }
}

/** Another skill of the organization already has the name. */
export class CustomSkillNameTakenError extends Error {
  readonly code = "CUSTOM_SKILL_NAME_TAKEN";

  constructor(options?: ErrorOptions) {
    super("custom skill name taken", options);
    this.name = "CustomSkillNameTakenError";
  }
}

/** The definition breaks a rule the schema cannot check (plan instruction cap, unknown skill). */
export class InvalidCustomDefinitionError extends Error {
  readonly code = "INVALID_CUSTOM_DEFINITION";
  readonly details: readonly ErrorDetail[];

  constructor(details: readonly ErrorDetail[], options?: ErrorOptions) {
    super(
      `invalid custom definition: ${details.map((detail) => `${detail.field} ${detail.issue}`).join(", ")}`,
      options,
    );
    this.name = "InvalidCustomDefinitionError";
    this.details = details;
  }
}
