import type { EndpointDefinition } from "./endpoint.ts";
import { EndpointDefinitionError } from "./endpoint-definition-error.ts";

export type EndpointRegistry = {
  /** Every endpoint, sorted by path then method (stable OpenAPI output). */
  readonly list: () => EndpointDefinition[];
  readonly get: (id: string) => EndpointDefinition | undefined;
};

const METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// `/v1/projects/{projectId}` and `/v1/projects/{id}` are the same route for a router.
const routeKey = (endpoint: EndpointDefinition): string => `${endpoint.method} ${endpoint.path.replaceAll(/\{[^}]+\}/g, "{}")}`;

const compareEndpoints = (left: EndpointDefinition, right: EndpointDefinition): number => {
  if (left.path !== right.path) return left.path < right.path ? -1 : 1;
  return METHOD_ORDER.indexOf(left.method) - METHOD_ORDER.indexOf(right.method);
};

/**
 * Builds the endpoint catalog from descriptors (a composition step).
 * @throws {EndpointDefinitionError} on a duplicate id or a duplicate method + path.
 */
export const createEndpointRegistry = (endpoints: readonly EndpointDefinition[]): EndpointRegistry => {
  const byId = new Map<string, EndpointDefinition>();
  const idByRoute = new Map<string, string>();
  for (const endpoint of endpoints) {
    if (byId.has(endpoint.id)) {
      throw new EndpointDefinitionError({
        code: "DUPLICATE_ENDPOINT_ID",
        endpointId: endpoint.id,
        problems: [`duplicate endpoint id ${endpoint.id}`],
      });
    }
    const existing = idByRoute.get(routeKey(endpoint));
    if (existing !== undefined) {
      throw new EndpointDefinitionError({
        code: "DUPLICATE_ENDPOINT_ROUTE",
        endpointId: endpoint.id,
        problems: [`${endpoint.method} ${endpoint.path} is already ${existing}`],
      });
    }
    byId.set(endpoint.id, endpoint);
    idByRoute.set(routeKey(endpoint), endpoint.id);
  }
  const sorted = [...byId.values()].sort(compareEndpoints);
  return { list: () => [...sorted], get: (id) => byId.get(id) };
};
