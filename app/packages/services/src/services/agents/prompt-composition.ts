// Composition root of the prompt store (SP5 Task 9, decision 0038).
import type { Sql } from "postgres";
import type { AuditWriter } from "../audit/application/use-cases/record-audit.ts";
import { createMastraPromptEvalGateway } from "./adapters/driven/mastra-prompt-eval-gateway.ts";
import { createPostgresPromptRepository } from "./adapters/driven/postgres-prompt-repository.ts";
import type { ServerlessIdTokenSource } from "./adapters/driven/serverless-id-token.ts";
import type { PromptDeps } from "./application/prompt-deps.ts";
import { type ActivatePromptVersion, makeActivatePromptVersion } from "./application/use-cases/activate-prompt-version.ts";
import { type CreatePromptVersion, makeCreatePromptVersion } from "./application/use-cases/create-prompt-version.ts";
import { type ListPromptActivations, type ListPromptVersions, makeListPromptActivations, makeListPromptVersions } from "./application/use-cases/list-prompt-versions.ts";
import { makeRunPromptEval, type RunPromptEval } from "./application/use-cases/run-prompt-eval.ts";

export type PromptServices = {
  readonly createVersion: CreatePromptVersion;
  readonly listVersions: ListPromptVersions;
  readonly listActivations: ListPromptActivations;
  readonly runEval: RunPromptEval;
  readonly activate: ActivatePromptVersion;
};

/** Binds the prompt store use cases (in-memory repository and a fake eval gateway in unit tests). */
export const createPromptServices = (deps: PromptDeps): PromptServices => ({
  createVersion: makeCreatePromptVersion(deps),
  listVersions: makeListPromptVersions(deps),
  listActivations: makeListPromptActivations(deps),
  runEval: makeRunPromptEval(deps),
  activate: makeActivatePromptVersion(deps),
});

/** Postgres store + the Mastra eval route (web `/v1` routes). */
export const createPostgresPromptServices = (args: {
  readonly sql: Sql;
  readonly audit: AuditWriter;
  readonly mastraUrl: string;
  readonly serverlessToken: ServerlessIdTokenSource | null;
}): PromptServices =>
  createPromptServices({
    prompts: createPostgresPromptRepository(args.sql),
    evals: createMastraPromptEvalGateway({ baseUrl: args.mastraUrl, serverlessToken: args.serverlessToken }),
    audit: args.audit,
  });
