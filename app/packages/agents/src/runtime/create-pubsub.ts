import { EventEmitterPubSub, type PubSub } from "@mastra/core/events";

/** Constructor of the GCP adapter; a test seam in place of the lazy import. */
export type GcpPubSubClass = new (config: { projectId: string }) => PubSub;

export class PubSubConfigError extends Error {
  readonly code = "PUBSUB_CONFIG_INVALID";

  constructor(reason: string) {
    super(`PUBSUB_CONFIG_INVALID: ${reason}`);
    this.name = "PubSubConfigError";
  }
}

// Lazy: `@mastra/google-cloud-pubsub` pulls @google-cloud/pubsub (gRPC) and inngest, which
// local runs never need.
const loadGoogleCloudPubSub = async (): Promise<GcpPubSubClass> => (await import("@mastra/google-cloud-pubsub")).GoogleCloudPubSub;

/**
 * Mastra's event bus (SP3 spec §14, Task 25): `memory` is Mastra's in-process
 * `EventEmitterPubSub` (one instance, local); `gcp` is `GoogleCloudPubSub` on the Firebase
 * project, so workflow and durable-run events reach every Cloud Run instance. Credentials
 * come from ADC; `PUBSUB_EMULATOR_HOST` points the client at the emulator in local.
 * @throws {PubSubConfigError} for `gcp` without a project id.
 */
export const createPubSub = async (
  env: { readonly MASTRA_PUBSUB: "memory" | "gcp"; readonly FIREBASE_PROJECT_ID: string },
  deps: { readonly loadGcp?: () => Promise<GcpPubSubClass> } = {},
): Promise<PubSub> => {
  if (env.MASTRA_PUBSUB === "memory") return new EventEmitterPubSub();
  if (env.FIREBASE_PROJECT_ID.trim() === "") throw new PubSubConfigError("gcp needs FIREBASE_PROJECT_ID");
  const GoogleCloudPubSub = await (deps.loadGcp ?? loadGoogleCloudPubSub)();
  return new GoogleCloudPubSub({ projectId: env.FIREBASE_PROJECT_ID });
};
