import { AGENT_PRINCIPAL_KEY, type RequestContextReader } from "../context/agent-request-context.ts";

/**
 * Platform maintenance workflows write across tenants, so they run only from platform schedules or
 * in process: a run whose context carries a caller principal (an HTTP start) is refused.
 */
export const isPlatformRun = (requestContext: RequestContextReader): boolean => requestContext.get(AGENT_PRINCIPAL_KEY) === undefined;

export const PLATFORM_ONLY = "PLATFORM_ONLY";
