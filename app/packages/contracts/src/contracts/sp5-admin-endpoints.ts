import type { EndpointDefinition } from "./http/endpoint.ts";
import { PROMPT_ENDPOINTS } from "./agents/prompt-endpoints.ts";
import { OBSERVABILITY_ENDPOINTS } from "./observability/endpoints.ts";
import { ADMIN_PLATFORM_ENDPOINTS } from "./platform/admin-endpoints.ts";
import { FLAG_ENDPOINTS } from "./platform/flag-endpoints.ts";

/** `/v1` endpoints of the SP5 console APIs (flags, prompts, admin, traces, evals), registered by `composition.ts`. */
export const SP5_ADMIN_ENDPOINTS: readonly EndpointDefinition[] = [...FLAG_ENDPOINTS, ...ADMIN_PLATFORM_ENDPOINTS, ...PROMPT_ENDPOINTS, ...OBSERVABILITY_ENDPOINTS];
