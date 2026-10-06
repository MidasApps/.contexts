import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { PromptEvalGateway } from "./ports/prompt-eval-gateway.ts";
import type { PromptRepository } from "./ports/prompt-repository.ts";

/** What the prompt store use cases need (SP5 Task 9, decision 0038). */
export type PromptDeps = {
  readonly prompts: PromptRepository;
  readonly evals: PromptEvalGateway;
  readonly audit: AuditWriter;
};

/** Who writes: staff (platform prompts, `/v1/admin`) or an organization's members (its addendum). */
export type PromptActor = "staff" | "tenant";
