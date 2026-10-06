export type EndpointDefinitionErrorCode = "INVALID_ENDPOINT" | "DUPLICATE_ENDPOINT_ID" | "DUPLICATE_ENDPOINT_ROUTE";

/** An endpoint declared wrong is a bug: it fails when descriptors load, never at request time. */
export class EndpointDefinitionError extends Error {
  readonly code: EndpointDefinitionErrorCode;
  readonly endpointId: string;
  readonly problems: readonly string[];

  constructor(args: { code: EndpointDefinitionErrorCode; endpointId: string; problems: readonly string[] }) {
    super(`Endpoint ${args.endpointId}: ${args.problems.join("; ")}`);
    this.name = "EndpointDefinitionError";
    this.code = args.code;
    this.endpointId = args.endpointId;
    this.problems = args.problems;
  }
}
