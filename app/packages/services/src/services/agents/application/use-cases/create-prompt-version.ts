import { createHash } from "node:crypto";
import type { CreatePromptVersionInput, PromptVersion, UserPrincipal } from "@core/contracts";
import type { PromptKey } from "../ports/prompt-repository.ts";
import type { PromptDeps } from "../prompt-deps.ts";
import { recordPromptAudit } from "./prompt-audit.ts";

export type CreatePromptVersion = (command: {
  readonly actor: UserPrincipal;
  readonly key: PromptKey;
  readonly input: CreatePromptVersionInput;
  readonly requestId: string;
}) => Promise<PromptVersion>;

/**
 * Every write is a new version (decision 0038): the next number of the key, the body's SHA-256,
 * the author. Nothing is ever updated in place. Audited `PROMPT_VERSION_CREATED` with the hash.
 */
export const makeCreatePromptVersion =
  (deps: Pick<PromptDeps, "prompts" | "audit">): CreatePromptVersion =>
  async (command) => {
    const bodySha256 = createHash("sha256").update(command.input.body, "utf8").digest("hex");
    const version = await deps.prompts.insertVersion({
      ...command.key,
      body: command.input.body,
      bodySha256,
      note: command.input.note ?? null,
      createdBy: command.actor.uid,
    });
    await recordPromptAudit(deps, {
      action: "PROMPT_VERSION_CREATED",
      actor: command.actor,
      key: command.key,
      targetId: version.id,
      requestId: command.requestId,
      fingerprint: bodySha256,
    });
    return version;
  };
