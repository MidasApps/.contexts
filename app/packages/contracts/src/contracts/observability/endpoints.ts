// Traces, evals and feedback `/v1` descriptors (SP5 spec §8, decision 0040).
import { z } from "zod";
import { MessageFeedbackInputSchema, MessageFeedbackSchema } from "../conversations/message-feedback.schema.ts";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { OrganizationQuerySchema } from "../workflows/endpoints.ts";
import { AddEvalDatasetItemInputSchema, CreateEvalDatasetInputSchema, EvalDatasetItemSchema } from "./eval-dataset-item.schema.ts";
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
  startedAfter: IsoDateTimeSchema.optional().meta(none("Only traces that started at or after this instant (UTC).")),
  startedBefore: IsoDateTimeSchema.optional().meta(none("Only traces that started before this instant (UTC); must be after `startedAfter`.")),
});
const traceParams = z.object({ traceId: TraceIdSchema.meta(none("Trace id.")) });
const datasetParams = z.object({ datasetId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).meta(none("Dataset id.")) });
const itemParams = datasetParams.extend({ itemId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).meta(none("Dataset item id.")) });
const experimentParams = z.object({ experimentId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).meta(none("Experiment id.")) });

export const listTracesEndpoint = defineEndpoint({
  id: "traces.list",
  method: "GET",
  path: "/v1/traces",
  auth: "principal",
  query: OrganizationQuerySchema.extend(traceFilters.shape),
  responses: { 200: pagedEnvelope(TraceSummarySchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"] },
  summary: "Lists the organization's traces, newest first, optionally of a time range; filtered by tenant on the server, cost from the usage ledger (core.trace.read).",
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
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF },
  summary: "Lists traces of every tenant, optionally one and of a time range, with the cost the usage ledger recorded (staff, platform.trace.read).",
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

export const createEvalDatasetEndpoint = defineEndpoint({
  id: "evals.createDataset",
  method: "POST",
  path: "/v1/evals/datasets",
  auth: "user",
  query: OrganizationQuerySchema,
  body: CreateEvalDatasetInputSchema,
  responses: { 201: dataEnvelope(EvalDatasetSchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"], 409: ["CONFLICT"], 503: ["UPSTREAM_UNAVAILABLE"] },
  summary: "Creates an empty dataset of the organization; a name the organization already uses answers 409 (core.eval.write).",
});

export const listEvalDatasetItemsEndpoint = defineEndpoint({
  id: "evals.listDatasetItems",
  method: "GET",
  path: "/v1/evals/datasets/{datasetId}/items",
  auth: "principal",
  params: datasetParams,
  query: OrganizationQuerySchema.extend(PageNumberQuerySchema.shape),
  responses: { 200: pagedEnvelope(EvalDatasetItemSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Lists the items of one of the organization's datasets, newest first; another tenant's dataset answers 404 (core.eval.read).",
});

export const addEvalDatasetItemEndpoint = defineEndpoint({
  id: "evals.addDatasetItem",
  method: "POST",
  path: "/v1/evals/datasets/{datasetId}/items",
  auth: "user",
  params: datasetParams,
  query: OrganizationQuerySchema,
  body: AddEvalDatasetItemInputSchema,
  responses: { 201: dataEnvelope(EvalDatasetItemSchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"], 404: ["NOT_FOUND"], 503: ["UPSTREAM_UNAVAILABLE"] },
  summary: "Adds a manual item (input and expected answer) to one of the organization's datasets (core.eval.write).",
});

export const deleteEvalDatasetItemEndpoint = defineEndpoint({
  id: "evals.deleteDatasetItem",
  method: "DELETE",
  path: "/v1/evals/datasets/{datasetId}/items/{itemId}",
  auth: "user",
  params: itemParams,
  query: OrganizationQuerySchema,
  responses: { 204: null },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"], 503: ["UPSTREAM_UNAVAILABLE"] },
  summary: "Deletes an item of one of the organization's datasets; past experiments keep their results (core.eval.write).",
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

export const getEvalExperimentEndpoint = defineEndpoint({
  id: "evals.getExperiment",
  method: "GET",
  path: "/v1/evals/experiments/{experimentId}",
  auth: "principal",
  params: experimentParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(EvalExperimentSummarySchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Reads one of the organization's experiments, to compare experiments of different list pages; another tenant's answers 404 (core.eval.read).",
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

export const adminGetExperimentEndpoint = defineEndpoint({
  id: "evals.adminGetExperiment",
  method: "GET",
  path: "/v1/admin/experiments/{experimentId}",
  auth: "user",
  params: experimentParams,
  responses: { 200: dataEnvelope(EvalExperimentSummarySchema) },
  errors: { ...STAFF, 404: ["NOT_FOUND"] },
  summary: "Reads any experiment, to compare experiments of different list pages (staff, platform.eval.manage).",
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
  createEvalDatasetEndpoint,
  listEvalDatasetItemsEndpoint,
  addEvalDatasetItemEndpoint,
  deleteEvalDatasetItemEndpoint,
  listEvalExperimentsEndpoint,
  getEvalExperimentEndpoint,
  startEvalExperimentEndpoint,
  adminListDatasetsEndpoint,
  adminListExperimentsEndpoint,
  adminGetExperimentEndpoint,
  recordMessageFeedbackEndpoint,
];
