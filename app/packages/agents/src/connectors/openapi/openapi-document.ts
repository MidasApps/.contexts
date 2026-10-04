import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import { guardedFetch, type ResolveHost } from "../../tools/web/url-guard.ts";
import { readCappedText } from "./capped-body.ts";

/** A dereferenced OpenAPI 3.0/3.1 document. */
export type OpenApiDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

export const MAX_SPEC_BYTES = 2 * 1024 * 1024;
export const SPEC_TIMEOUT_MS = 15_000;

export class OpenApiConnectorError extends Error {
  readonly code: "SPEC_UNAVAILABLE" | "SPEC_INVALID" | "SPEC_TOO_LARGE" | "SERVER_NOT_ALLOWED";

  constructor(code: OpenApiConnectorError["code"], options?: ErrorOptions) {
    super(`openapi connector refused: ${code}`, options);
    this.name = "OpenApiConnectorError";
    this.code = code;
  }
}

// An unresolved `$ref` left by `external: false` points outside the document: refuse it.
const hasRef = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  if (!Array.isArray(value) && "$ref" in value) return true;
  return Object.values(value).some((child) => hasRef(child, seen));
};

/**
 * Validates and dereferences a parsed OpenAPI 3.x document. External `$ref`s are never
 * resolved: the parser would fetch them itself, outside the SSRF guard.
 * @throws {OpenApiConnectorError} `SPEC_INVALID` for Swagger 2, invalid or external-ref documents.
 */
export const dereferenceOpenApi = async (api: unknown): Promise<OpenApiDocument> => {
  try {
    const document = await SwaggerParser.validate(structuredClone(api) as OpenApiDocument, {
      resolve: { external: false },
    });
    if (!("openapi" in document) || !String(document.openapi).startsWith("3.")) throw new Error("not OpenAPI 3");
    if (hasRef(document)) throw new Error("external $ref");
    return document;
  } catch (error: unknown) {
    throw new OpenApiConnectorError("SPEC_INVALID", { cause: error });
  }
};

/**
 * Downloads (through the SSRF guard, 15 s, 2 MB) and dereferences the connector's JSON spec.
 * @throws {OpenApiConnectorError} when the spec cannot be fetched, is too large or is invalid.
 */
export const loadOpenApiDocument = async (args: {
  readonly specUrl: string;
  readonly allowedHosts: readonly string[];
  readonly fetch?: typeof fetch;
  readonly resolve?: ResolveHost;
}): Promise<OpenApiDocument> => {
  let text: string;
  try {
    const response = await guardedFetch(args.specUrl, {
      allowedHosts: args.allowedHosts,
      init: { headers: { accept: "application/json" }, signal: AbortSignal.timeout(SPEC_TIMEOUT_MS) },
      ...(args.fetch === undefined ? {} : { fetch: args.fetch }),
      ...(args.resolve === undefined ? {} : { resolve: args.resolve }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const body = await readCappedText(response, MAX_SPEC_BYTES);
    if (body.truncated) throw new OpenApiConnectorError("SPEC_TOO_LARGE");
    text = body.text;
  } catch (error: unknown) {
    throw error instanceof OpenApiConnectorError
      ? error
      : new OpenApiConnectorError("SPEC_UNAVAILABLE", { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    throw new OpenApiConnectorError("SPEC_INVALID", { cause: error });
  }
  return dereferenceOpenApi(parsed);
};
