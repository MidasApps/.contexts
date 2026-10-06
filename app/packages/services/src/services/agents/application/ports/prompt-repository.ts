import type { PromptActivation, PromptScope, PromptVersion } from "@core/contracts";

/** Which prompt line: an agent's platform instructions, or one organization's addendum. */
export type PromptKey = { readonly agentId: string; readonly scope: PromptScope; readonly tenantId: string | null };

/** The bodies a run uses: the active platform version and the tenant's active addendum. */
export type ActivePrompts = {
  readonly platform: { readonly versionId: string; readonly body: string } | null;
  readonly addendum: { readonly versionId: string; readonly body: string } | null;
};

/**
 * Append-only prompt store (decision 0038): `agents.prompt_versions` / `agents.prompt_activations`
 * under row level security. A tenant-scoped read sees platform rows and its own rows only.
 */
export type PromptRepository = {
  /** Next version of the key (1, 2, ...); a concurrent writer of the same key makes one retry. */
  readonly insertVersion: (
    input: PromptKey & {
      readonly body: string;
      readonly bodySha256: string;
      readonly note: string | null;
      readonly createdBy: string;
    },
  ) => Promise<PromptVersion>;
  /** Newest first. */
  readonly listVersions: (key: PromptKey) => Promise<readonly PromptVersion[]>;
  /** A version visible under `tenantId` (null = platform rows only). */
  readonly getVersion: (input: {
    readonly versionId: string;
    readonly tenantId: string | null;
  }) => Promise<PromptVersion | null>;
  /** Records the eval of a version (the only columns the runtime role may update). */
  readonly recordEval: (input: {
    readonly versionId: string;
    readonly tenantId: string | null;
    readonly experimentId: string;
    readonly verdict: "passed" | "failed";
  }) => Promise<void>;
  readonly insertActivation: (
    input: PromptKey & {
      readonly versionId: string;
      readonly forced: boolean;
      readonly reason: string | null;
      readonly activatedBy: string;
    },
  ) => Promise<PromptActivation>;
  /** Newest first; the first one is active. */
  readonly listActivations: (key: PromptKey) => Promise<readonly PromptActivation[]>;
  readonly getActive: (input: { readonly agentId: string; readonly tenantId: string | null }) => Promise<ActivePrompts>;
};
