import { describe, expect, it } from "vitest";
import { createInMemoryIdempotencyStore } from "../../../shared/idempotency/in-memory-idempotency-store.ts";
import { AgentCommandError } from "./agent-command-error.ts";
import { createCommandIdempotency } from "./run-command-once.ts";

const clock = { now: () => new Date("2026-09-30T12:00:00.000Z") };
const COMMAND = { tenantId: "Jd8sK2lPq0WnR5tYu3bV", commandId: "tenancy.CreateProjectInput", idempotencyKey: "run-1:call-1" };

const setup = () => createCommandIdempotency({ store: createInMemoryIdempotencyStore({ clock }) });

describe("createCommandIdempotency", () => {
  it("runs a command once per key and replays the stored result afterwards", async () => {
    const once = setup();
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.resolve({ projectId: "Pq8sK2lPq0WnR5tYu3bV", name: "Launch" });
    };
    const first = await once.runOnce({ ...COMMAND, input: { name: "Launch" }, run });
    const second = await once.runOnce({ ...COMMAND, input: { name: "Launch" }, run });
    expect(first).toEqual({ output: { projectId: "Pq8sK2lPq0WnR5tYu3bV", name: "Launch" }, replayed: false });
    expect(second).toEqual({ output: { projectId: "Pq8sK2lPq0WnR5tYu3bV", name: "Launch" }, replayed: true });
    expect(runs).toBe(1);
  });

  it("keeps keys apart per tenant and per command", async () => {
    const once = setup();
    let runs = 0;
    const run = () => Promise.resolve((runs += 1));
    await once.runOnce({ ...COMMAND, input: {}, run });
    await once.runOnce({ ...COMMAND, tenantId: "Other0000000000000000", input: {}, run });
    await once.runOnce({ ...COMMAND, commandId: "example.ArchiveNoteCommand", input: {}, run });
    expect(runs).toBe(3);
  });

  it("refuses the same key with another input (IDEMPOTENCY_KEY_REUSED) without running", async () => {
    const once = setup();
    await once.runOnce({ ...COMMAND, input: { name: "Launch" }, run: () => Promise.resolve(null) });
    const reused = once.runOnce({ ...COMMAND, input: { name: "Other" }, run: () => Promise.reject(new Error("must not run")) });
    await expect(reused).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(reused).rejects.toBeInstanceOf(AgentCommandError);
  });

  it("refuses a second call while the first is still running (COMMAND_IN_PROGRESS)", async () => {
    const once = setup();
    let release: () => void = () => undefined;
    const slow = once.runOnce({ ...COMMAND, input: {}, run: () => new Promise((resolve) => (release = () => resolve("done"))) });
    await expect(once.runOnce({ ...COMMAND, input: {}, run: () => Promise.resolve("again") })).rejects.toMatchObject({ code: "COMMAND_IN_PROGRESS" });
    release();
    expect(await slow).toEqual({ output: "done", replayed: false });
  });

  it("frees the key when the command throws, so a retry can run it", async () => {
    const once = setup();
    await expect(once.runOnce({ ...COMMAND, input: {}, run: () => Promise.reject(new Error("boom")) })).rejects.toThrow("boom");
    expect(await once.runOnce({ ...COMMAND, input: {}, run: () => Promise.resolve("ok") })).toEqual({ output: "ok", replayed: false });
  });

  it("stores an undefined result as null", async () => {
    const once = setup();
    await once.runOnce({ ...COMMAND, input: {}, run: () => Promise.resolve(undefined) });
    expect(await once.runOnce({ ...COMMAND, input: {}, run: () => Promise.resolve("x") })).toEqual({ output: null, replayed: true });
  });
});
