// Traces, evals and feedback `/v1` descriptors (SP5 spec §8, decision 0040).
import { z } from "zod";
import { MessageFeedbackInputSchema, MessageFeedbackSchema } from "../conversations/message-feedback.schema.ts";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { OrganizationQuerySchema } from "../workflows/endpoints.ts";
import { EvalDatasetSchema, StartEvalExperimentInputSchema } from "./eval-dataset.schema.ts";
import { EvalExperimentSummarySchema } from "./eval-experiment-summary.schema.ts";
import { TraceDetailSchema } from "./trace-detail.schema.ts";
import { TraceIdSchema, TraceStatusSchema, TraceSummarySchema } from "./trace-summary.schema.ts";

const STAFF = { 403: ["FORBIDDEN", "MFA_REQUIRED"] } as const;

/** Page of a console list: Mastra storage pages by number (`page` from 0), not by cursor. */
const PageNumberQuerySchema = z.object({
  page: z.coerce.number().int().min(0).max(1000).default(0).meta(none("Page number, from 0.")),
  perPage: z.coerce.number().int().min(1).max(100).default(20).meta(none("Page size, 1-100 (default 20).")),
});

/** `{ data: [...], meta: { hasMore } }` of a console list. */
const pagedEnvelope = <Schema extends z.ZodType>(schema: Schema) =>
  z.object({ data: z.array(schema), meta: z.object({ hasMore: z.boolean().meta(none("Whether a next page exists.")) }).meta(none("Paging state.")) });

const traceFilters = PageNumberQuerySchema.extend({
  agentId: z.string().regex(/^[a-z][a-z0-9-]*$/).optional().meta(none("Only traces of this agent.")),
  status: TraceStatusSchema.optional().meta(none("Only traces in this status.")),
});
const traceParams = z.object({ traceId: TraceIdSchema.meta(none("Trace id.")) });

export const listTracesEndpoint = defineEndpoint({
  id: "traces.list",
  method: "GET",
  path: "/v1/traces",
  auth: "principal",
  query: OrganizationQuerySchema.extend(traceFilters.shape),
  responses: { 200: pagedEnvelope(TraceSummarySchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's traces, newest first; filtered by tenant on the server (core.trace.read).",
});

export const getTraceEndpoint = defineEndpoint({
  id: "traces.get",
  method: "GET",
  path: "/v1/traces/{traceId}",
  auth: "principal",
  params: traceParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(TraceDetailSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Reads one trace of the organization with its spans; another tenant's trace answers 404 (core.trace.read).",
});

export const adminListTracesEndpoint = defineEndpoint({
  id: "traces.adminList",
  method: "GET",
  path: "/v1/admin/traces",
  auth: "user",
  query: traceFilters.extend({ organizationId: OrganizationIdSchema.optional().meta(none("Only this organization's traces.")) }),
  responses: { 200: pagedEnvelope(TraceSummarySchema) },
  errors: STAFF,
  summary: "Lists traces of every tenant, optionally one (staff, platform.trace.read).",
});

export const adminGetTraceEndpoint = defineEndpoint({
  id: "traces.adminGet",
  method: "GET",
  path: "/v1/admin/traces/{traceId}",
  auth: "user",
  params: traceParams,
  responses: { 200: dataEnvelope(TraceDetailSchema) },
  errors: { ...STAFF, 404: ["NOT_FOUND"] },
  summary: "Reads any trace with its spans (staff, platform.trace.read).",
});

export const listEvalDatasetsEndpoint = defineEndpoint({
  id: "evals.listDatasets",
  method: "GET",
  path: "/v1/evals/datasets",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(EvalDatasetSchema)) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's own datasets (core.eval.read).",
});

export const listEvalExperimentsEndpoint = defineEndpoint({
  id: "evals.listExperiments",
  method: "GET",
  path: "/v1/evals/experiments",
  auth: "principal",
  query: OrganizationQuerySchema.extend(PageNumberQuerySchema.shape),
  responses: { 200: pagedEnvelope(EvalExperimentSummarySchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's experiments with scores and verdicts (core.eval.read).",
});

export const startEvalExperimentEndpoint = defineEndpoint({
  id: "evals.startExperiment",
  method: "POST",
  path: "/v1/evals/experiments",
  auth: "user",
  query: OrganizationQuerySchema,
  body: StartEvalExperimentInputSchema,
  responses: { 202: dataEnvelope(z.strictObject({ experimentId: z.string().min(1).meta(none("Started experiment.")) })) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"], 404: ["NOT_FOUND"], 503: ["UPSTREAM_UNAVAILABLE"] },
  summary: "Runs an agent the organization enabled on one of its datasets, as the caller (core.eval.write).",
});

export const adminListDatasetsEndpoint = defineEndpoint({
  id: "evals.adminListDatasets",
  method: "GET",
  path: "/v1/admin/datasets",
  auth: "user",
  responses: { 200: dataEnvelope(z.array(EvalDatasetSchema)) },
  errors: STAFF,
  summary: "Lists every dataset, platform and tenant ones (staff, platform.eval.manage).",
});

export const adminListExperimentsEndpoint = defineEndpoint({
  id: "evals.adminListExperiments",
  method: "GET",
  path: "/v1/admin/experiments",
  auth: "user",
  query: PageNumberQuerySchema,
  responses: { 200: pagedEnvelope(EvalExperimentSummarySchema) },
  errors: STAFF,
  summary: "Lists every experiment: CI eval runs, prompt evals and tenant experiments (staff, platform.eval.manage).",
});

export const recordMessageFeedbackEndpoint = defineEndpoint({
  id: "conversations.recordFeedback",
  method: "POST",
  path: "/v1/conversations/{conversationId}/feedback",
  auth: "user",
  params: z.object({ conversationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).meta(none("Conversation id.")) }),
  body: MessageFeedbackInputSchema,
  responses: { 200: dataEnvelope(MessageFeedbackSchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Rates an assistant message (thumbs up/down, optional comment); one rating per message and user, a second one replaces it.",
});

export const OBSERVABILITY_ENDPOINTS: readonly EndpointDefinition[] = [
  listTracesEndpoint,
  getTraceEndpoint,
  adminListTracesEndpoint,
  adminGetTraceEndpoint,
  listEvalDatasetsEndpoint,
  listEvalExperimentsEndpoint,
  startEvalExperimentEndpoint,
  adminListDatasetsEndpoint,
  adminListExperimentsEndpoint,
  recordMessageFeedbackEndpoint,
];
