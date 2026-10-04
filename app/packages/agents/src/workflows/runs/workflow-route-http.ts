import { resolveRequestId } from "@core/services";
import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import {
  type AgentContextSnapshot,
  type RequestContextReader,
  readAgentContext,
} from "../../context/agent-request-context.ts";
import type { AccessPort } from "../../runtime/runtime-ports.ts";

/**
 * Shared HTTP helpers of the SP5 custom Mastra routes (workflow runs, tenant schedules). They
 * live outside the API prefix and behind the context middleware, so the caller, its tenant and
 * its permissions come only from the verified context; every route authorizes again through
 * SP1 (defense in depth: `/v1` authorized first). Errors use the `api.md` §6 envelope, and the
 * codes are the gateway's allowlist (`mastra-workflow-gateway.ts`).
 */

export type WorkflowRouteErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "WORKFLOW_NOT_STARTABLE"
  | "WORKFLOW_NOT_SCHEDULABLE"
  | "SCHEDULE_INTERVAL_TOO_SHORT"
  | "INTERNAL_ERROR";

const STATUS: Readonly<Record<WorkflowRouteErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  WORKFLOW_NOT_STARTABLE: 422,
  WORKFLOW_NOT_SCHEDULABLE: 422,
  SCHEDULE_INTERVAL_TOO_SHORT: 422,
  INTERNAL_ERROR: 500,
};

const MESSAGES: Readonly<Record<number, string>> = {
  400: "One or more fields are invalid.",
  401: "Authentication required.",
  403: "Not allowed.",
  404: "Not found.",
  409: "Conflict.",
  422: "The request breaks a business rule.",
  500: "Internal error.",
};

export type FieldIssue = { readonly field: string; readonly issue: string };

const requestIdOf = (requestContext: RequestContextReader): string => {
  const value = requestContext.get("requestId");
  return typeof value === "string" ? value : resolveRequestId(undefined);
};

export const routeError = (
  code: WorkflowRouteErrorCode,
  requestContext: RequestContextReader,
  details?: readonly FieldIssue[],
): Response => {
  const status = STATUS[code];
  return Response.json(
    {
      error: {
        code,
        message: MESSAGES[status] ?? "Error.",
        ...(details === undefined ? {} : { details }),
        requestId: requestIdOf(requestContext),
      },
    },
    { status },
  );
};

export const dataJson = (data: unknown, init?: { status?: number; meta?: unknown }): Response =>
  Response.json({ data, ...(init?.meta === undefined ? {} : { meta: init.meta }) }, { status: init?.status ?? 200 });

export type RouteInputs = { readonly mastra: Mastra; readonly requestContext: RequestContext<unknown> };

export const inputsOf = (context: { readonly get: (key: "mastra" | "requestContext") => unknown }): RouteInputs => ({
  mastra: context.get("mastra") as Mastra,
  requestContext: context.get("requestContext") as RequestContext<unknown>,
});

/**
 * The verified caller with the permission at its organization, or the refusal to answer.
 * Infrastructure errors of `authorize` reject (the route answers 500).
 */
export const authorizeCaller = async (args: {
  readonly access: AccessPort;
  readonly requestContext: RequestContextReader;
  readonly permission: string;
}): Promise<
  { readonly ok: true; readonly data: AgentContextSnapshot } | { readonly ok: false; readonly response: Response }
> => {
  const snapshot = readAgentContext(args.requestContext);
  if (!snapshot.ok) return { ok: false, response: routeError("UNAUTHORIZED", args.requestContext) };
  const { context, principal } = snapshot.data;
  const node = { level: "organization" as const, tenantId: context.tenantId };
  const decision = await args.access.authorize({ principal, permission: args.permission, node });
  if (!decision.allowed) return { ok: false, response: routeError("FORBIDDEN", args.requestContext) };
  return { ok: true, data: snapshot.data };
};

/** Validates a body against a workflow's input schema (Standard Schema), field issues on failure. */
export const validateWorkflowInput = async (
  schema: { readonly "~standard": { readonly validate: (value: unknown) => unknown } } | undefined,
  value: unknown,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly details: FieldIssue[] }> => {
  if (schema === undefined) return { ok: true };
  const result = (await schema["~standard"].validate(value)) as {
    issues?: readonly { message: string; path?: readonly unknown[] }[];
  };
  if (result.issues === undefined || result.issues.length === 0) return { ok: true };
  const details = result.issues.map((issue) => ({
    field: [
      "inputData",
      ...(issue.path ?? []).map((part) =>
        typeof part === "object" && part !== null && "key" in part ? String(part.key) : String(part),
      ),
    ].join("."),
    issue: "INVALID",
  }));
  return { ok: false, details };
};
