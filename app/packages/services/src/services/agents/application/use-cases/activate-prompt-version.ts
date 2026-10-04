import type { ActivatePromptVersionInput, PromptActivation, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { PromptKey } from "../ports/prompt-repository.ts";
import type { PromptActor, PromptDeps } from "../prompt-deps.ts";
import { recordPromptAudit } from "./prompt-audit.ts";

export type ActivationError =
  | { readonly code: "NOT_FOUND" }
  | { readonly code: "EVAL_REQUIRED" }
  | { readonly code: "FORCE_FORBIDDEN" };

export type ActivatePromptVersion = (command: {
  readonly actor: UserPrincipal;
  readonly by: PromptActor;
  readonly key: PromptKey;
  readonly input: ActivatePromptVersionInput;
  readonly requestId: string;
}) => Promise<Result<PromptActivation, ActivationError>>;

/**
 * A new activation row (decision 0038; a rollback activates an older version the same way). The
 * version must belong to the key and carry a `passed` eval verdict, else 409 `EVAL_REQUIRED`; staff
 * may force with a reason (audited `PROMPT_ACTIVATION_FORCED`), a tenant never.
 */
export const makeActivatePromptVersion =
  (deps: Pick<PromptDeps, "prompts" | "audit">): ActivatePromptVersion =>
  async (command) => {
    const { key, input } = command;
    const version = await deps.prompts.getVersion({ versionId: input.versionId, tenantId: key.tenantId });
    if (
      version === null ||
      version.agentId !== key.agentId ||
      version.scope !== key.scope ||
      version.tenantId !== key.tenantId
    )
      return err({ code: "NOT_FOUND" });
    const forced = input.force === true;
    if (forced && command.by !== "staff") return err({ code: "FORCE_FORBIDDEN" });
    if (!forced && version.evalVerdict !== "passed") return err({ code: "EVAL_REQUIRED" });
    const activation = await deps.prompts.insertActivation({
      ...key,
      versionId: version.id,
      forced,
      reason: input.reason ?? null,
      activatedBy: command.actor.uid,
    });
    await recordPromptAudit(deps, {
      action: forced ? "PROMPT_ACTIVATION_FORCED" : "PROMPT_ACTIVATED",
      actor: command.actor,
      key,
      targetId: version.id,
      requestId: command.requestId,
      reason: input.reason ?? null,
    });
    return ok(activation);
  };
