import type { PromptEvalResult, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { PromptEvalError } from "../ports/prompt-eval-gateway.ts";
import type { PromptKey } from "../ports/prompt-repository.ts";
import type { PromptDeps } from "../prompt-deps.ts";
import { recordPromptAudit } from "./prompt-audit.ts";

export type RunPromptEval = (command: {
  readonly actor: UserPrincipal;
  readonly key: PromptKey;
  readonly versionId: string;
  readonly requestId: string;
}) => Promise<Result<PromptEvalResult, PromptEvalError>>;

/**
 * Evaluates a version of the caller's prompt line (decision 0038): the version must belong to the
 * key (another agent's or organization's answers 404); the runtime runs the eval set and records
 * the verdict. Audited `PROMPT_EVALUATED`.
 */
export const makeRunPromptEval =
  (deps: PromptDeps): RunPromptEval =>
  async (command) => {
    const version = await deps.prompts.getVersion({ versionId: command.versionId, tenantId: command.key.tenantId });
    const owned =
      version !== null &&
      version.agentId === command.key.agentId &&
      version.scope === command.key.scope &&
      version.tenantId === command.key.tenantId;
    if (!owned) return err({ code: "NOT_FOUND", status: 404 });
    const result = await deps.evals.evaluate({
      versionId: command.versionId,
      tenantId: command.key.tenantId,
      requestId: command.requestId,
    });
    if (!result.ok) return result;
    await recordPromptAudit(deps, {
      action: "PROMPT_EVALUATED",
      actor: command.actor,
      key: command.key,
      targetId: command.versionId,
      requestId: command.requestId,
    });
    return ok(result.data);
  };
