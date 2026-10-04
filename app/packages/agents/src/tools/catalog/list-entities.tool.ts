import { z } from "zod";
import { defineCoreTool } from "../define-core-tool.ts";
import { type AiCatalogReader, CATALOG_READ_PERMISSION } from "./ai-catalog-reader.ts";

export { CATALOG_READ_PERMISSION };
export const MAX_ENTITIES_PAGE = 50;

const EntitySummarySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  context: z.string(),
  kind: z.string(),
  description: z.string(),
});

/** `catalog.listEntities` (spec §8.2): the data contracts the caller may read, from the AI catalog. */
export const createListEntitiesTool = (deps: { readonly catalog: AiCatalogReader }) =>
  defineCoreTool({
    id: "catalog.listEntities",
    description:
      "Lists the data contracts (entities, views, commands) the user can see. Use it first when the user asks what data exists or which forms/actions are available.",
    kind: "read",
    permission: CATALOG_READ_PERMISSION,
    inputSchema: z.strictObject({
      query: z.string().max(200).optional().describe("Words to match in the contract id, name or description."),
      kind: z.string().max(40).optional().describe("Only this contract kind, e.g. entity, view or command."),
      limit: z.int().min(1).max(MAX_ENTITIES_PAGE).default(20).describe("Maximum contracts to return (1-50)."),
    }),
    outputSchema: z.strictObject({ entities: z.array(EntitySummarySchema), total: z.int(), truncated: z.boolean() }),
    execute: (input, ctx) =>
      Promise.resolve(
        deps.catalog.list({
          permissions: new Set(ctx.agent.permissions),
          limit: input.limit,
          ...(input.query === undefined ? {} : { query: input.query }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
        }),
      ),
  });
