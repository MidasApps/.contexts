// `/v1` descriptors of the example module's notes (follow-up #38, decision 0063). The web app
// lists their ids in its route resolver and serves the handlers of `src/server/example-routes.ts`.
import { defineEndpoint, listEnvelope, NoteSchema, none, OrganizationIdSchema, PageQuerySchema } from "@core/contracts";
import { z } from "zod";

export const listNotesEndpoint = defineEndpoint({
  id: "example.listNotes",
  method: "GET",
  path: "/v1/organizations/{organizationId}/notes",
  auth: "principal",
  params: z.object({ organizationId: OrganizationIdSchema.meta(none("Organization that owns the notes.")) }),
  query: PageQuerySchema,
  responses: { 200: listEnvelope(NoteSchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's notes, newest first (example.note.read), archived ones included.",
});

/** Every endpoint of the module, for the web route resolver and the generated OpenAPI. */
export const EXAMPLE_ENDPOINTS = [listNotesEndpoint] as const;
