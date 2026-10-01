import {
  createMastraWorkflowApprovalSettler,
  createServerlessIdTokenSource,
  type Logger,
  makeSettleOnApprovalUpdate,
  type SettleOnUpdateOutcome,
  type WorkflowApprovalSettler,
} from "@core/services";
import type { FunctionsEnv } from "../functions-env.schema.ts";

/** Mastra dev server of `pnpm dev` (same default as the web app). */
export const LOCAL_MASTRA_URL = "http://localhost:4111";

/** Misconfiguration: a remote environment has no `MASTRA_URL`, so settled runs cannot resume. */
export class MissingMastraUrlError extends Error {
  readonly code = "MASTRA_URL_MISSING";

  constructor() {
    super("MASTRA_URL is not set; workflow approvals cannot be settled");
    this.name = "MissingMastraUrlError";
  }
}

type DocumentData = { readonly data: () => unknown } | undefined;

/** The part of the Firestore `onDocumentUpdated` event the handler reads. */
export type ApprovalRequestUpdatedEvent = {
  readonly id: string;
  readonly params: { readonly id: string };
  readonly data?: { readonly before?: DocumentData; readonly after?: DocumentData } | undefined;
};

const settlerOf = (env: FunctionsEnv): WorkflowApprovalSettler => {
  const baseUrl = env.MASTRA_URL ?? (env.APP_ENV === "local" ? LOCAL_MASTRA_URL : undefined);
  if (baseUrl === undefined) throw new MissingMastraUrlError();
  const remote = env.APP_ENV !== "local" && env.MASTRA_AUDIENCE !== undefined;
  return createMastraWorkflowApprovalSettler({ baseUrl, serverlessToken: remote ? createServerlessIdTokenSource({ audience: env.MASTRA_AUDIENCE ?? baseUrl }) : null });
};

/**
 * Handler of the `onApprovalRequestSettled` trigger (decision 0036): a `workflow-resume`
 * approval request that became `rejected`, `expired` or `cancelled` resumes its suspended run
 * on the `record` branch, through the Mastra settle route. Approvals are the SP1 handler's job.
 * Idempotent; throws on infrastructure errors so the event is retried. The settler is built on
 * the first event, so deploy analysis loads this module without network or credentials.
 */
export const makeOnApprovalRequestSettled = (deps: {
  readonly env: FunctionsEnv;
  readonly logger: Logger;
  /** Test seam; defaults to the Mastra settle route. */
  readonly settler?: WorkflowApprovalSettler;
}): ((event: ApprovalRequestUpdatedEvent) => Promise<SettleOnUpdateOutcome>) => {
  let settle: ReturnType<typeof makeSettleOnApprovalUpdate> | undefined;
  return (event) => {
    settle ??= makeSettleOnApprovalUpdate({ settler: deps.settler ?? settlerOf(deps.env), logger: deps.logger });
    return settle({ approvalRequestId: event.params.id, before: event.data?.before?.data(), after: event.data?.after?.data(), requestId: event.id });
  };
};
