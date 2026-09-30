import { z } from "zod";
import { defineContract } from "../contract.ts";

/** Stable error code, SCREAMING_SNAKE (contracts/api.md §6.1); clients program against it. */
export const ErrorCodeSchema = z.string().regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/, {
  error: "Expected SCREAMING_SNAKE_CASE.",
});
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

const none = (description: string) => ({ description, pii: "none" as const });

export const ErrorDetailSchema = z.object({
  field: z.string().meta(none("Dotted path of the offending input field.")),
  issue: ErrorCodeSchema.meta(none("What is wrong with the field, SCREAMING_SNAKE.")),
});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

/** Error body of every `/v1` failure (contracts/api.md §6). */
export const ErrorEnvelopeSchema = z.object({
  error: z
    .object({
      code: ErrorCodeSchema.meta(none("Stable error code; the client maps it to copy.")),
      message: z.string().min(1).meta(none("Short, generic English message; never internals.")),
      details: z.array(ErrorDetailSchema).optional().meta(none("Granular problems, e.g. one per invalid field.")),
      requestId: z.string().min(1).meta(none("Request id to correlate with logs (X-Request-Id).")),
    })
    .meta(none("The error.")),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const ErrorEnvelopeContract = defineContract(ErrorEnvelopeSchema, {
  id: "http.ErrorEnvelope",
  kind: "view",
  description: "Error body returned by every /v1 endpoint on failure (contracts/api.md §6).",
  examples: [
    {
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more fields are invalid.",
        details: [{ field: "name", issue: "TOO_SMALL" }],
        requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      },
    },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
});

/** `meta.page` of a cursor-paginated list (contracts/api.md §9.1). */
export const PageMetaSchema = z.object({
  cursor: z.string().min(1).nullable().meta({ description: "Opaque cursor of the next page; null at the end." }),
  hasMore: z.boolean().meta({ description: "Whether another page exists." }),
  limit: z.int().min(1).max(100).meta({ description: "Page size used for this response." }),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;

/** Query of every list endpoint: `?cursor=…&limit=20` (max 100). Extend it with filters. */
export const PageQuerySchema = z.object({
  cursor: z.string().min(1).optional().meta({ description: "Cursor returned by the previous page." }),
  // Query strings are text: coerce, then enforce an integer in range.
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({ description: "Page size, 1-100 (default 20)." }),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

/**
 * Success body of a single resource: `{ data }` (contracts/api.md §5.1).
 * @example dataEnvelope(MeSchema) // { data: Me }
 */
export const dataEnvelope = <Schema extends z.ZodType>(schema: Schema) =>
  // No .meta() on `schema`: it would clone it and a registered contract would lose its $ref.
  z.object({ data: schema });

/**
 * Success body of a cursor-paginated list: `{ data: [], meta: { page } }` (contracts/api.md §5.2, §9.1).
 * @example listEnvelope(ProjectSchema)
 */
export const listEnvelope = <Schema extends z.ZodType>(schema: Schema) =>
  z.object({
    data: z.array(schema).meta({ description: "The items of this page." }),
    meta: z.object({ page: PageMetaSchema.meta({ description: "Pagination state." }) }).meta({ description: "Response metadata." }),
  });
