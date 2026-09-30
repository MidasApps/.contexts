import type { z } from "zod";
import { EndpointDefinitionError } from "./endpoint-definition-error.ts";
import { ErrorCodeSchema } from "./envelopes.schema.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** `user`: Firebase user only; `principal`: also device and service (API key); `none`: public. */
export type EndpointAuth = "user" | "principal" | "none";

export type SuccessStatus = 200 | 201 | 202 | 204;
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429;

/** Success bodies by status; `204` has no body (contracts/api.md §5.3). */
export type EndpointResponses = {
  readonly 200?: z.ZodType;
  readonly 201?: z.ZodType;
  readonly 202?: z.ZodType;
  readonly 204?: null;
};

/**
 * Domain error codes an endpoint can answer, by status. The pipeline's own
 * errors (400 VALIDATION_FAILED, 401 UNAUTHORIZED, 409 IDEMPOTENCY_KEY_REUSED,
 * 429 RATE_LIMITED, 500 INTERNAL_ERROR) are implied by the descriptor and need
 * not be listed.
 */
export type EndpointErrors = { readonly [Status in ErrorStatus]?: readonly string[] };

/** Spec-first description of one `/v1` operation (SP1 spec §7.1). */
export type EndpointDefinition = {
  /** `<context>.<operation>`, e.g. `identity.getMe`; the OpenAPI operationId. */
  readonly id: string;
  readonly method: HttpMethod;
  /** OpenAPI-style path, e.g. `/v1/projects/{projectId}`. */
  readonly path: string;
  readonly auth: EndpointAuth;
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  readonly responses: EndpointResponses;
  readonly errors?: EndpointErrors;
  readonly idempotency?: "optional" | "required";
  /** Named rate limit policy (decision 0009), e.g. `device-redeem`. */
  readonly rateLimit?: string;
  readonly summary: string;
};

type OutputOf<Schema> = Schema extends z.ZodType ? z.output<Schema> : undefined;

/** Parsed input a handler receives: each part is `undefined` when not declared. */
export type InferEndpointInput<E extends EndpointDefinition> = {
  params: OutputOf<E["params"]>;
  query: OutputOf<E["query"]>;
  body: OutputOf<E["body"]>;
};

/** Success body (union over the declared statuses); `undefined` for 204. */
export type InferEndpointResponse<E extends EndpointDefinition> = {
  [Status in keyof E["responses"]]-?: OutputOf<E["responses"][Status]>;
}[keyof E["responses"]];

const ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][A-Za-z0-9]*$/;
const STATIC_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PARAM_SEGMENT = /^\{([a-z][A-Za-z0-9]*)\}$/;
const POLICY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const V1_PREFIX = "/v1/";

/** Names of the `{param}` segments of a path, in order. */
export const pathParamNames = (path: string): string[] =>
  path
    .split("/")
    .map((segment) => PARAM_SEGMENT.exec(segment)?.[1])
    .filter((name): name is string => name !== undefined);

const checkPath = (path: string): string[] => {
  if (!path.startsWith(V1_PREFIX)) return ["path must start with /v1/"];
  return path
    .slice(V1_PREFIX.length)
    .split("/")
    .filter((segment) => !STATIC_SEGMENT.test(segment) && !PARAM_SEGMENT.test(segment))
    .map((segment) => `invalid path segment: ${segment === "" ? "(empty)" : segment}`);
};

const checkParams = (endpoint: EndpointDefinition): string[] => {
  const inPath = pathParamNames(endpoint.path);
  const declared = Object.keys(endpoint.params?.shape ?? {});
  return [
    ...inPath.filter((name) => !declared.includes(name)).map((name) => `path param {${name}} is not in params`),
    ...declared.filter((name) => !inPath.includes(name)).map((name) => `params key ${name} is not in the path`),
  ];
};

const checkMethod = (endpoint: EndpointDefinition): string[] => {
  if (endpoint.method !== "GET") return [];
  return [
    ...(endpoint.body === undefined ? [] : ["GET cannot have a body"]),
    ...(endpoint.idempotency === undefined ? [] : ["GET cannot take an Idempotency-Key"]),
  ];
};

const checkResponses = (responses: EndpointResponses): string[] => {
  const entries = Object.entries(responses) as [string, unknown][];
  if (entries.length === 0) return ["at least one success response is required"];
  return entries.flatMap(([status, schema]) => {
    if (status === "204") return schema === null ? [] : ["204 response cannot have a schema"];
    return schema === null || schema === undefined ? [`${status} response needs a schema`] : [];
  });
};

const checkNames = (endpoint: EndpointDefinition): string[] => {
  const errorEntries = Object.entries<readonly string[]>(endpoint.errors ?? {});
  const badCodes = errorEntries.flatMap(([status, codes]) =>
    codes.filter((code) => !ErrorCodeSchema.safeParse(code).success).map((code) => `error code ${code} (${status}) must be SCREAMING_SNAKE`),
  );
  return [
    ...(ID_PATTERN.test(endpoint.id) ? [] : ["id must be <context>.<operation>, e.g. identity.getMe"]),
    ...badCodes,
    ...(endpoint.rateLimit === undefined || POLICY_PATTERN.test(endpoint.rateLimit) ? [] : ["rateLimit must be a kebab-case policy id"]),
  ];
};

/**
 * Validates an endpoint descriptor and returns it unchanged (typed as declared).
 * Pure: nothing is registered; `composition.ts` lists descriptors explicitly.
 * @throws {EndpointDefinitionError} listing every problem (a declaration bug).
 * @example
 *   export const getMeEndpoint = defineEndpoint({
 *     id: "identity.getMe", method: "GET", path: "/v1/me", auth: "user",
 *     responses: { 200: dataEnvelope(MeSchema) }, summary: "Reads the signed-in user.",
 *   });
 */
export const defineEndpoint = <const E extends EndpointDefinition>(endpoint: E): E => {
  const problems = [
    ...checkPath(endpoint.path),
    ...checkParams(endpoint),
    ...checkMethod(endpoint),
    ...checkResponses(endpoint.responses),
    ...checkNames(endpoint),
  ];
  if (problems.length > 0) throw new EndpointDefinitionError({ code: "INVALID_ENDPOINT", endpointId: endpoint.id, problems });
  return endpoint;
};
