import type { PromptActivation, PromptVersion } from "@core/contracts";
import type { PromptKey } from "../ports/prompt-repository.ts";
import type { PromptDeps } from "../prompt-deps.ts";

export type ListPromptVersions = (key: PromptKey) => Promise<readonly PromptVersion[]>;
export type ListPromptActivations = (key: PromptKey) => Promise<readonly PromptActivation[]>;

/** Versions of a prompt line, newest first (the handler authorized the caller for the key). */
export const makeListPromptVersions =
  (deps: Pick<PromptDeps, "prompts">): ListPromptVersions =>
  (key) =>
    deps.prompts.listVersions(key);

/** Activations of a prompt line, newest first: the first one is active. */
export const makeListPromptActivations =
  (deps: Pick<PromptDeps, "prompts">): ListPromptActivations =>
  (key) =>
    deps.prompts.listActivations(key);
