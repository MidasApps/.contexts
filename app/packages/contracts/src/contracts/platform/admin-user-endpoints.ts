// Staff user search and batched lookup (`/v1/admin/users`, decision 0044).
import { z } from "zod";
import { none, personal } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { AdminUserSearchBySchema, AdminUserSummarySchema } from "./admin-user.schema.ts";

export const adminListUsersEndpoint = defineEndpoint({
  id: "admin.listUsers",
  method: "GET",
  path: "/v1/admin/users",
  auth: "user",
  query: PageQuerySchema.extend({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .meta(personal("Text to find: the start of a name or of an email, or a whole user id.")),
    by: AdminUserSearchBySchema.optional().meta(
      none("How to read `query`; without it: an email when it has `@`, else a user id when one matches, else a name."),
    ),
    ids: z
      .string()
      .min(1)
      .max(13_000)
      .optional()
      .meta(personal("Comma-separated user ids to look up at once (at most 100); not with `query`.")),
  }),
  responses: { 200: listEnvelope(AdminUserSummarySchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN", "MFA_REQUIRED"] },
  summary:
    "Finds users by name prefix (case and accents ignored), email prefix (emails are stored lowercase) or exact id, or looks up to 100 ids at once; `query` or `ids` is required (staff, platform.user.read).",
});

export const ADMIN_USER_ENDPOINTS: readonly EndpointDefinition[] = [adminListUsersEndpoint];
