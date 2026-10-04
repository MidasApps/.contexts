import { EventEmitterPubSub, PubSub } from "@mastra/core/events";
import { describe, expect, it } from "vitest";
import { createPubSub, PubSubConfigError } from "./create-pubsub.ts";

class StubGcpPubSub extends PubSub {
  readonly config: unknown;
  constructor(config: unknown) {
    super();
    this.config = config;
  }
  publish(): Promise<void> {
    return Promise.resolve();
  }
  subscribe(): Promise<void> {
    return Promise.resolve();
  }
  unsubscribe(): Promise<void> {
    return Promise.resolve();
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

describe("createPubSub", () => {
  it("uses Mastra's in-process EventEmitter for memory, without loading the GCP adapter", async () => {
    let loaded = false;
    const pubsub = await createPubSub(
      { MASTRA_PUBSUB: "memory", FIREBASE_PROJECT_ID: "demo-core" },
      { loadGcp: () => ((loaded = true), Promise.reject(new Error("must not load"))) },
    );
    expect(pubsub).toBeInstanceOf(EventEmitterPubSub);
    expect(loaded).toBe(false);
  });

  it("builds GoogleCloudPubSub with the project id for gcp (loaded lazily)", async () => {
    const pubsub = await createPubSub(
      { MASTRA_PUBSUB: "gcp", FIREBASE_PROJECT_ID: "prod-project" },
      { loadGcp: () => Promise.resolve(StubGcpPubSub) },
    );
    expect(pubsub).toBeInstanceOf(StubGcpPubSub);
    expect((pubsub as StubGcpPubSub).config).toEqual({ projectId: "prod-project" });
  });

  it("refuses gcp without a project id", async () => {
    await expect(
      createPubSub(
        { MASTRA_PUBSUB: "gcp", FIREBASE_PROJECT_ID: "" },
        { loadGcp: () => Promise.resolve(StubGcpPubSub) },
      ),
    ).rejects.toBeInstanceOf(PubSubConfigError);
  });
});
