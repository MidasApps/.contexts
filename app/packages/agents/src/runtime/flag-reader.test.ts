import { CORE_FLAGS } from "@core/services";
import { describe, expect, it } from "vitest";
import { createFakeFlagsPort } from "../testing/fake-ports.ts";
import { CORE_FLAG_KEYS, isAgentRunPath } from "./core-flag-keys.ts";
import { createFlagReader } from "./flag-reader.ts";
import type { FlagsPort } from "./runtime-ports.ts";

describe("createFlagReader", () => {
  it("caches values 30 s per organization, then reads again", async () => {
    const port = createFakeFlagsPort({ "ai.kill-switch": true });
    let now = 0;
    const reader = createFlagReader(port, { now: () => now });
    expect(await reader.isEnabled({ key: "ai.kill-switch", tenantId: "t1", fallback: false })).toBe(true);
    expect(await reader.isEnabled({ key: "chat.voice", tenantId: "t1", fallback: false })).toBe(true);
    await reader.isEnabled({ key: "ai.kill-switch", tenantId: "t2", fallback: false });
    expect(port.reads).toEqual(["t1", "t2"]);
    now = 29_999;
    await reader.isEnabled({ key: "ai.kill-switch", tenantId: "t1", fallback: false });
    expect(port.reads).toHaveLength(2);
    now = 30_000;
    await reader.isEnabled({ key: "ai.kill-switch", tenantId: "t1", fallback: false });
    expect(port.reads).toEqual(["t1", "t2", "t1"]);
  });

  it("keeps the last values when a refresh fails and answers the fallback when nothing is cached", async () => {
    let fail = false;
    const port: FlagsPort = { getValues: () => (fail ? Promise.reject(new Error("down")) : Promise.resolve({ "ai.kill-switch": false })) };
    let now = 0;
    const reader = createFlagReader(port, { now: () => now });
    expect(await reader.isEnabled({ key: "ai.kill-switch", tenantId: "t1", fallback: true })).toBe(false);
    fail = true;
    now = 60_000;
    expect(await reader.isEnabled({ key: "ai.kill-switch", tenantId: "t1", fallback: true })).toBe(false);
    expect(await reader.isEnabled({ key: "ai.kill-switch", tenantId: "t2", fallback: true })).toBe(true);
    expect(await reader.isEnabled({ key: "unknown.flag", tenantId: "t1", fallback: false })).toBe(false);
  });

  it("reads only keys the services registry declares, and stops agent, chat and voice paths only", () => {
    const registry = new Set(CORE_FLAGS.map((flag) => flag.key));
    for (const key of Object.values(CORE_FLAG_KEYS)) expect(registry.has(key)).toBe(true);
    const applies = isAgentRunPath();
    expect(["/api/agents/assistant/stream", "/api/mcp/core/mcp", "/chat/assistant", "/voice/speech"].every(applies)).toBe(true);
    expect(["/api/workflows/approval-demo/runs", "/workflow-runs/x", "/tenant-schedules", "/workflow-approvals/a/settle"].some(applies)).toBe(false);
  });
});
