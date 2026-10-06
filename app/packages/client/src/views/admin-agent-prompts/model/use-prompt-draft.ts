"use client";

import type { PromptActivation, PromptAgentId, PromptVersion } from "@core/contracts";
import { activeVersionOf, usePromptSeed } from "#/entities/prompt-version/index.ts";

/** What the "new version" editor opens with, and the key that resets it when that changes. */
export type PromptDraft = {
  readonly key: string;
  readonly initialBody: string;
  readonly initialSource: "active" | "seed";
};

/**
 * The starting text of a new version: the active version, else the newest one, else (no version
 * yet) the agent's code instructions (follow-up 86), so the editor never starts from nothing.
 */
export const usePromptDraft = (
  agentId: PromptAgentId,
  data: { versions: PromptVersion[]; activations: PromptActivation[] } | undefined,
): PromptDraft => {
  const active = data === undefined ? undefined : activeVersionOf(data.versions, data.activations);
  const firstVersion = data?.versions.length === 0;
  const seed = usePromptSeed(agentId, { enabled: firstVersion });
  const seedBody = firstVersion ? seed.data?.body : undefined;
  return {
    key: active?.id ?? (seedBody === undefined ? "empty" : "seed"),
    initialBody: active?.body ?? data?.versions[0]?.body ?? seedBody ?? "",
    initialSource: seedBody === undefined ? "active" : "seed",
  };
};
