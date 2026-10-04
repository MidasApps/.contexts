import { randomUUID } from "node:crypto";
import type { E2eEnv } from "./e2e-env.ts";
import { createEmulatorAuth } from "./emulator.ts";
import { apiFor, SEED_USERS, type World } from "./seed-users.ts";

/**
 * Sends one chat turn as the owner, in Alpha Growth (the journeys chat in Alpha Launch with their
 * own users), reads it to the end and deletes the conversation. A fresh agent runtime builds its
 * memory vector index on the first turn; journeys that streamed in parallel during that build
 * waited past their timeouts. Run once by each app's setup project, before the journeys.
 */
export const warmAgentRuntime = async (env: E2eEnv, world: World): Promise<void> => {
  const owner = await apiFor(env, createEmulatorAuth(env), SEED_USERS.owner);
  const message = { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Warm-up" }] };
  const response = await owner.raw("POST", "/v1/chat", {
    organizationId: world.alpha.id,
    projectId: world.alpha.projects.growth.id,
    message,
  });
  if (response.status !== 200) throw new Error(`warm-up POST /v1/chat → ${String(response.status)}`);
  const conversationId = response.headers.get("x-conversation-id");
  await response.text();
  if (conversationId === null) return;
  const removed = await owner.raw("DELETE", `/v1/conversations/${conversationId}`);
  await removed.body?.cancel();
};
