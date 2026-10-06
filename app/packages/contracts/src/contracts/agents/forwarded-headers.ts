/**
 * Headers the `/v1` gateway sends to the private Mastra service (SP3 spec §4.1).
 * The gateway (`@core/services`) and the Mastra context middleware (`@core/agents`)
 * both read the names from here, so they cannot drift. Names are lowercase
 * because `Headers` normalizes them.
 */
export const FORWARDED_HEADERS = {
  authorization: "authorization",
  serverlessAuthorization: "x-serverless-authorization",
  tenantId: "x-tenant-id",
  projectId: "x-project-id",
  unitId: "x-unit-id",
  locale: "x-locale",
  displayTimeZone: "x-time-zone",
  nodeTimeZone: "x-node-time-zone",
  currency: "x-currency",
  activeScreen: "x-active-screen",
  /** Chat conversation id; the Mastra memory thread of the run (SP3 Task 7). */
  conversationId: "x-conversation-id",
  requestId: "x-request-id",
  traceparent: "traceparent",
} as const;

export type ForwardedHeaderName = (typeof FORWARDED_HEADERS)[keyof typeof FORWARDED_HEADERS];

/** Longest route id accepted in `X-Active-Screen`. */
export const ACTIVE_SCREEN_MAX_LENGTH = 200;
