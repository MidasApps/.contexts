import type { App } from "firebase-admin/app";
import type { EnvironmentFlagValues } from "../../application/ports/flag-store.ts";

/** The parts of a Remote Config template this adapter touches (firebase-admin `RemoteConfigTemplate`). */
export type RemoteConfigTemplateLike = {
  parameters: Record<
    string,
    { defaultValue?: { value?: string } | Record<string, unknown>; valueType?: string; description?: string }
  >;
  readonly etag: string;
};

/** The narrow client over `getRemoteConfig()` (a fake in tests). */
export type RemoteConfigClient = {
  readonly getTemplate: () => Promise<RemoteConfigTemplateLike>;
  /** Rejects with a conflict when the template changed since it was read (ETag). */
  readonly publishTemplate: (template: RemoteConfigTemplateLike) => Promise<unknown>;
};

/** Parameter names allow letters, digits and underscores: `ai.kill-switch` → `core_flag_ai_kill_switch`. */
export const remoteConfigParameterOf = (key: string): string => `core_flag_${key.replace(/[.-]/g, "_")}`;

const valueOf = (parameter: RemoteConfigTemplateLike["parameters"][string] | undefined): boolean | undefined => {
  const raw =
    parameter?.defaultValue !== undefined && "value" in parameter.defaultValue
      ? parameter.defaultValue.value
      : undefined;
  return raw === "true" ? true : raw === "false" ? false : undefined;
};

/**
 * Environment values outside local (decision 0039): one boolean parameter per flag in the
 * project's Remote Config template. firebase-admin 14.5 reads server templates but cannot
 * publish them, so the values live in the project template; they are plain booleans, never
 * tenant data (overrides stay in Firestore). A write re-reads the template and publishes with
 * its ETag, retrying once on a concurrent change.
 * @param keys the registry keys to read (other parameters are ignored).
 */
export const createRemoteConfigEnvironmentFlagValues = (deps: {
  readonly client: RemoteConfigClient;
  readonly keys: readonly string[];
}): EnvironmentFlagValues => {
  const publish = async (key: string, value: boolean): Promise<void> => {
    const template = await deps.client.getTemplate();
    template.parameters[remoteConfigParameterOf(key)] = {
      defaultValue: { value: String(value) },
      valueType: "BOOLEAN",
      // The template is project-wide: no user ids in it.
      description: `Core feature flag ${key} (decision 0039).`,
    };
    await deps.client.publishTemplate(template);
  };
  return {
    read: async () => {
      const { parameters } = await deps.client.getTemplate();
      const values: Record<string, boolean> = {};
      for (const key of deps.keys) {
        const value = valueOf(parameters[remoteConfigParameterOf(key)]);
        if (value !== undefined) values[key] = value;
      }
      return values;
    },
    write: async ({ key, value }) => {
      try {
        await publish(key, value);
      } catch {
        // ETag conflict (another publish in between): read again and retry once; a second failure rejects.
        await publish(key, value);
      }
    },
  };
};

/** The real client, loading the Remote Config SDK on first use (local never loads it). */
export const createLazyRemoteConfigClient = (app: App): RemoteConfigClient => {
  const remoteConfig = async () => (await import("firebase-admin/remote-config")).getRemoteConfig(app);
  return {
    getTemplate: async () => (await remoteConfig()).getTemplate() as Promise<RemoteConfigTemplateLike>,
    publishTemplate: async (template) =>
      (await remoteConfig()).publishTemplate(
        template as Parameters<Awaited<ReturnType<typeof remoteConfig>>["publishTemplate"]>[0],
      ),
  };
};
