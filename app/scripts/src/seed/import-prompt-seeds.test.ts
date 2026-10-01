import { createInMemoryPromptRepository } from "@core/services";
import { describe, expect, it } from "vitest";
import { importPromptSeeds } from "./import-prompt-seeds.ts";

describe("importPromptSeeds", () => {
  it("imports every code seed as platform version 1, active, and skips agents that already have versions", async () => {
    const { repository, versions, activations } = createInMemoryPromptRepository();
    const first = await importPromptSeeds({ prompts: repository });
    expect(first.imported).toEqual(["assistant", "knowledge", "data", "action", "web"]);
    expect(versions.map((version) => [version.agentId, version.version, version.scope])).toContainEqual(["knowledge", 1, "platform"]);
    expect((await repository.getActive({ agentId: "assistant", tenantId: null })).platform?.body).toContain("assistant");
    expect(activations.every((activation) => activation.forced && activation.reason !== null)).toBe(true);
    const again = await importPromptSeeds({ prompts: repository });
    expect(again).toEqual({ imported: [], skipped: ["assistant", "knowledge", "data", "action", "web"] });
    expect(versions).toHaveLength(5);
  });
});
