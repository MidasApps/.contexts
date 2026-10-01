import { type ApprovalRequest, ApprovalRequestSchema, type ApprovalStatus, CoreErrorCodeSchema } from "@core/contracts";
import { z } from "zod";

/**
 * Typed client of SP1's approval endpoints (SP1 spec §7; SP5 spec §3.4): list an organization's
 * requests, approve, reject. The app injects the transport (the authenticated `/v1` fetch of the
 * shell), so this entity holds no session or base URL. Failures map to an `errors.<CODE>` i18n key.
 */

export type ApiTransport = (request: {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}) => Promise<Response>;

/** An API failure as the UI shows it: the stable code and its message key in the `errors` namespace. */
export type ApprovalApiError = { readonly status: number; readonly code: string; readonly messageKey: `errors.${string}` };

export type ApprovalApiResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ApprovalApiError };

export type ApprovalPage = { readonly items: ApprovalRequest[]; readonly cursor: string | null; readonly hasMore: boolean };

const ErrorBodySchema = z.object({ error: z.object({ code: z.string() }) });
const ListBodySchema = z.object({ data: z.array(ApprovalRequestSchema), meta: z.object({ page: z.object({ cursor: z.string().nullable(), hasMore: z.boolean() }) }) });
const OneBodySchema = z.object({ data: ApprovalRequestSchema });

/** Known core codes keep their message (e.g. 403 `SELF_APPROVAL_FORBIDDEN`); anything else is generic. */
export const approvalErrorOf = (status: number, code: string | null): ApprovalApiError => {
  const known = CoreErrorCodeSchema.safeParse(code);
  const resolved = known.success ? known.data : status >= 500 || status === 0 ? "UPSTREAM_UNAVAILABLE" : "INTERNAL_ERROR";
  return { status, code: resolved, messageKey: `errors.${resolved}` };
};

const readError = async (response: Response): Promise<ApprovalApiError> => {
  const body = ErrorBodySchema.safeParse(await response.json().catch(() => null));
  return approvalErrorOf(response.status, body.success ? body.data.error.code : null);
};

const call = async <T>(transport: ApiTransport, request: Parameters<ApiTransport>[0], schema: z.ZodType<T>): Promise<ApprovalApiResult<T>> => {
  let response: Response;
  try {
    response = await transport(request);
  } catch {
    return { ok: false, error: approvalErrorOf(0, null) };
  }
  if (!response.ok) return { ok: false, error: await readError(response) };
  const parsed = schema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: approvalErrorOf(502, "UPSTREAM_UNAVAILABLE") };
};

const segment = (value: string): string => encodeURIComponent(value);

export type ApprovalRequestsApi = {
  readonly list: (input: { readonly organizationId: string; readonly status?: ApprovalStatus; readonly cursor?: string; readonly limit?: number }) => Promise<ApprovalApiResult<ApprovalPage>>;
  readonly approve: (input: { readonly approvalRequestId: string; readonly reason?: string }) => Promise<ApprovalApiResult<ApprovalRequest>>;
  readonly reject: (input: { readonly approvalRequestId: string; readonly reason?: string }) => Promise<ApprovalApiResult<ApprovalRequest>>;
};

export const createApprovalRequestsApi = (transport: ApiTransport): ApprovalRequestsApi => {
  const decide = (verb: "approve" | "reject") => (input: { readonly approvalRequestId: string; readonly reason?: string }) =>
    call(transport, { method: "POST", path: `/v1/approval-requests/${segment(input.approvalRequestId)}/${verb}`, body: input.reason === undefined ? {} : { reason: input.reason } }, OneBodySchema).then(
      (result): ApprovalApiResult<ApprovalRequest> => (result.ok ? { ok: true, data: result.data.data } : result),
    );
  return {
    list: async ({ organizationId, status, cursor, limit }) => {
      const query = {
        ...(status === undefined ? {} : { status }),
        ...(cursor === undefined ? {} : { cursor }),
        ...(limit === undefined ? {} : { limit: String(limit) }),
      };
      const result = await call(transport, { method: "GET", path: `/v1/organizations/${segment(organizationId)}/approval-requests`, query }, ListBodySchema);
      return result.ok ? { ok: true, data: { items: result.data.data, cursor: result.data.meta.page.cursor, hasMore: result.data.meta.page.hasMore } } : result;
    },
    approve: decide("approve"),
    reject: decide("reject"),
  };
};
