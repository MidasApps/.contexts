import type { EndpointDefinition } from "./http/endpoint.ts";
import { ADMIN_PLATFORM_ENDPOINTS } from "./platform/admin-endpoints.ts";
import { FLAG_ENDPOINTS } from "./platform/flag-endpoints.ts";

/** `/v1` endpoints of the SP5 console APIs (flags, prompts, admin, traces, evals), registered by `composition.ts`. */
export const SP5_ADMIN_ENDPOINTS: readonly EndpointDefinition[] = [...FLAG_ENDPOINTS, ...ADMIN_PLATFORM_ENDPOINTS];
