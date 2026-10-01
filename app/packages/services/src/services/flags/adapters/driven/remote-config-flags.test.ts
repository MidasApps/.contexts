import { describe, expect, it } from "vitest";
import { createRemoteConfigEnvironmentFlagValues, remoteConfigParameterOf, type RemoteConfigClient, type RemoteConfigTemplateLike } from "./remote-config-flags.ts";

/** A Remote Config project with an ETag check: a publish of a stale template is refused once. */
const fakeRemoteConfig = (initial: RemoteConfigTemplateLike["parameters"], options: { conflictOnce?: boolean } = {}) => {
  let current: RemoteConfigTemplateLike = { parameters: structuredClone(initial), etag: "etag-1" };
  let conflict = options.conflictOnce ?? false;
  const published: RemoteConfigTemplateLike[] = [];
  const client: RemoteConfigClient = {
    getTemplate: () => Promise.resolve(structuredClone(current)),
    publishTemplate: (template) => {
      if (conflict || template.etag !== current.etag) {
        conflict = false;
        current = { ...current, etag: `${current.etag}+` };
        return Promise.reject(new Error("ETag mismatch"));
      }
      current = { parameters: structuredClone(template.parameters), etag: `${template.etag}+` };
      published.push(current);
      return Promise.resolve(current);
    },
  };
  return { client, published, current: () => current };
};

const KEYS = ["ai.kill-switch", "chat.voice"];

describe("Remote Config environment flag values", () => {
  it("reads only registry flags with a boolean default value", async () => {
    const remote = fakeRemoteConfig({
      core_flag_ai_kill_switch: { defaultValue: { value: "true" }, valueType: "BOOLEAN" },
      core_flag_chat_voice: { defaultValue: { useInAppDefault: true } },
      unrelated: { defaultValue: { value: "false" } },
    });
    const values = createRemoteConfigEnvironmentFlagValues({ client: remote.client, keys: KEYS });
    expect(await values.read()).toEqual({ "ai.kill-switch": true });
    expect(remoteConfigParameterOf("chat.voice.realtime")).toBe("core_flag_chat_voice_realtime");
  });

  it("publishes a boolean parameter without user data, keeping other parameters", async () => {
    const remote = fakeRemoteConfig({ unrelated: { defaultValue: { value: "x" } } });
    const values = createRemoteConfigEnvironmentFlagValues({ client: remote.client, keys: KEYS });
    await values.write({ key: "chat.voice", value: false, updatedBy: "uid-of-staff" });
    const { parameters } = remote.current();
    expect(parameters["core_flag_chat_voice"]).toMatchObject({ defaultValue: { value: "false" }, valueType: "BOOLEAN" });
    expect(parameters["unrelated"]).toEqual({ defaultValue: { value: "x" } });
    expect(JSON.stringify(parameters)).not.toContain("uid-of-staff");
    expect(await values.read()).toEqual({ "chat.voice": false });
  });

  it("re-reads and retries once when the template changed concurrently", async () => {
    const remote = fakeRemoteConfig({}, { conflictOnce: true });
    await createRemoteConfigEnvironmentFlagValues({ client: remote.client, keys: KEYS }).write({ key: "ai.kill-switch", value: true, updatedBy: "u" });
    expect(remote.published).toHaveLength(1);
    expect(remote.current().parameters["core_flag_ai_kill_switch"]?.defaultValue).toEqual({ value: "true" });
  });
});
