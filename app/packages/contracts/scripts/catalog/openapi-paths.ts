import { z } from "zod";
import type { EndpointDefinition, ErrorStatus } from "../../src/contracts/http/endpoint.ts";
import { ErrorEnvelopeContract } from "../../src/contracts/http/envelopes.schema.ts";
import { IdempotencyKeySchema } from "../../src/contracts/primitives/ids.schema.ts";
import type { RegisteredContract } from "../../src/contracts/registry.ts";
import { componentRef, renameCustomMetaKeys } from "./json-schema.ts";
import { isJsonRecord, type JsonRecord } from "./stable-json.ts";

type Io = "input" | "output";

const LOCAL_DEF_PREFIX = "#/$defs/";
const JSON_CONTENT = "application/json";
const SUCCESS_TEXT: Record<string, string> = { 200: "OK", 201: "Created", 202: "Accepted" };

/** `#/$defs/<contract id>` (single-schema output) → `#/components/schemas/<id>`. */
const rewriteLocalRefs = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(rewriteLocalRefs);
  if (!isJsonRecord(node)) return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => {
      if (key === "$ref" && typeof value === "string" && value.startsWith(LOCAL_DEF_PREFIX)) {
        return [key, componentRef(value.slice(LOCAL_DEF_PREFIX.length))];
      }
      return [key, rewriteLocalRefs(value)];
    }),
  );
};

/**
 * JSON Schema of one endpoint schema. Registered contracts carry an `id` in
 * `z.globalRegistry`, so `z.toJSONSchema` extracts them to `$defs`; they become
 * `$ref`s to OpenAPI components. Any other `$defs` entry would dangle.
 */
const toOperationSchema = (schema: z.ZodType, io: Io, contractIds: ReadonlySet<string>): JsonRecord => {
  const output = z.toJSONSchema(schema, { io, override: (ctx) => renameCustomMetaKeys(ctx.jsonSchema as JsonRecord) }) as JsonRecord;
  const { $defs: defs, ...rest } = output;
  delete rest["$schema"];
  const unknownDefs = Object.keys(isJsonRecord(defs) ? defs : {}).filter((id) => !contractIds.has(id));
  if (unknownDefs.length > 0) throw new Error(`endpoint schema has non-contract $defs: ${unknownDefs.join(", ")}`);
  return rewriteLocalRefs(rest) as JsonRecord;
};

const objectParameters = (args: { schema: z.ZodObject; location: "path" | "query"; contractIds: ReadonlySet<string> }): JsonRecord[] => {
  const json = toOperationSchema(args.schema, "input", args.contractIds);
  const properties = isJsonRecord(json["properties"]) ? json["properties"] : {};
  const required = new Set(Array.isArray(json["required"]) ? json["required"] : []);
  return Object.entries(properties).map(([name, property]) => {
    const { description, ...schema } = isJsonRecord(property) ? property : {};
    return {
      name,
      in: args.location,
      required: args.location === "path" || required.has(name),
      ...(typeof description === "string" ? { description } : {}),
      schema,
    };
  });
};

const idempotencyParameter = (endpoint: EndpointDefinition, contractIds: ReadonlySet<string>): JsonRecord[] =>
  endpoint.idempotency === undefined
    ? []
    : [
        {
          name: "Idempotency-Key",
          in: "header",
          required: endpoint.idempotency === "required",
          description: "ULID; a retry with the same key and body replays the first response (24 h).",
          schema: toOperationSchema(IdempotencyKeySchema, "input", contractIds),
        },
      ];

const buildParameters = (endpoint: EndpointDefinition, contractIds: ReadonlySet<string>): JsonRecord[] => [
  ...(endpoint.params ? objectParameters({ schema: endpoint.params, location: "path", contractIds }) : []),
  ...(endpoint.query ? objectParameters({ schema: endpoint.query, location: "query", contractIds }) : []),
  ...idempotencyParameter(endpoint, contractIds),
];

/** Declared domain errors plus the ones the `/v1` pipeline adds (SP1 spec §7.2). */
const collectErrorCodes = (endpoint: EndpointDefinition): Map<number, string[]> => {
  const codes = new Map<number, Set<string>>();
  const add = (status: number, code: string) => codes.set(status, (codes.get(status) ?? new Set()).add(code));
  if (endpoint.params || endpoint.query || endpoint.body) add(400, "VALIDATION_FAILED");
  if (endpoint.auth !== "none") add(401, "UNAUTHORIZED");
  if (endpoint.idempotency) add(409, "IDEMPOTENCY_KEY_REUSED");
  if (endpoint.rateLimit) add(429, "RATE_LIMITED");
  add(500, "INTERNAL_ERROR");
  const declared = Object.entries(endpoint.errors ?? {}) as [`${ErrorStatus}`, readonly string[]][];
  for (const [status, list] of declared) for (const code of list) add(Number(status), code);
  return new Map([...codes].map(([status, set]) => [status, [...set].sort()]));
};

const jsonContent = (schema: JsonRecord): JsonRecord => ({ [JSON_CONTENT]: { schema } });

const buildResponses = (endpoint: EndpointDefinition, contractIds: ReadonlySet<string>): JsonRecord => {
  const success = Object.entries(endpoint.responses).map(([status, schema]): [string, JsonRecord] => {
    if (schema === null || schema === undefined) return [status, { description: "No Content" }];
    return [status, { description: SUCCESS_TEXT[status] ?? "Success", content: jsonContent(toOperationSchema(schema, "output", contractIds)) }];
  });
  const errorRef = { $ref: componentRef(ErrorEnvelopeContract.id) };
  const failures = [...collectErrorCodes(endpoint)].map(([status, codes]): [string, JsonRecord] => [
    String(status),
    { description: codes.join(", "), "x-error-codes": codes, content: jsonContent(errorRef) },
  ]);
  return Object.fromEntries([...success, ...failures]);
};

const buildOperation = (endpoint: EndpointDefinition, contractIds: ReadonlySet<string>): JsonRecord => {
  const parameters = buildParameters(endpoint, contractIds);
  return {
    operationId: endpoint.id,
    summary: endpoint.summary,
    tags: [endpoint.id.split(".")[0] ?? endpoint.id],
    security: endpoint.auth === "none" ? [] : [{ bearerAuth: [] }],
    "x-auth": endpoint.auth,
    ...(endpoint.rateLimit ? { "x-rate-limit": endpoint.rateLimit } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(endpoint.body
      ? { requestBody: { required: true, content: jsonContent(toOperationSchema(endpoint.body, "input", contractIds)) } }
      : {}),
    responses: buildResponses(endpoint, contractIds),
  };
};

/**
 * OpenAPI `paths` from endpoint descriptors (decision 0001 extended to paths):
 * parameters and bodies come from the same Zod schemas the server validates with.
 */
export const buildOpenApiPaths = (args: {
  endpoints: readonly EndpointDefinition[];
  contracts: readonly RegisteredContract[];
}): JsonRecord => {
  const contractIds = new Set(args.contracts.map((contract) => contract.id));
  const paths: Record<string, JsonRecord> = {};
  for (const endpoint of args.endpoints) {
    paths[endpoint.path] = { ...paths[endpoint.path], [endpoint.method.toLowerCase()]: buildOperation(endpoint, contractIds) };
  }
  return paths;
};

const COMPONENT_PREFIX = componentRef("");

const collectRefs = (node: unknown, found: Set<string>): void => {
  if (Array.isArray(node)) node.forEach((child) => collectRefs(child, found));
  if (!isJsonRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string") found.add(value);
    else collectRefs(value, found);
  }
};

/** Every `$ref` in the document must point at an existing component schema. */
export const findDanglingRefs = (document: JsonRecord): string[] => {
  const components = isJsonRecord(document["components"]) ? document["components"] : {};
  const schemas = isJsonRecord(components["schemas"]) ? components["schemas"] : {};
  const refs = new Set<string>();
  collectRefs(document, refs);
  return [...refs]
    .filter((ref) => !ref.startsWith(COMPONENT_PREFIX) || !(ref.slice(COMPONENT_PREFIX.length) in schemas))
    .sort()
    .map((ref) => `dangling $ref: ${ref}`);
};
