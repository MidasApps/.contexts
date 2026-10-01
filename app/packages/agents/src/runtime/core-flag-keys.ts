/** Registry keys the runtime reads (`@core/services` `CORE_FLAGS`, decision 0039). */
export const CORE_FLAG_KEYS = {
  killSwitch: "ai.kill-switch",
  webTools: "ai.web-tools",
  voice: "chat.voice",
  voiceRealtime: "chat.voice.realtime",
  observationalMemory: "ai.memory.observational",
  schedules: "workflows.schedules",
} as const;

/**
 * Paths of agent runs the kill-switch stops: agent routes and MCP under the API prefix, the
 * chat routes and the voice routes. Workflows, schedules and the approval settle route keep
 * working (they are not model runs started by a user, and settling must finish what started).
 */
export const isAgentRunPath =
  (apiPrefix = "/api") =>
  (pathname: string): boolean =>
    pathname.startsWith(`${apiPrefix}/agents/`) || pathname.startsWith(`${apiPrefix}/mcp/`) || pathname.startsWith("/chat/") || pathname.startsWith("/voice/");
