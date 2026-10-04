import { z } from "zod";
import { defineCoreTool } from "../define-core-tool.ts";
import { toolFailure } from "../tool-errors.ts";
import type { AiCatalogReader } from "./ai-catalog-reader.ts";
import { CATALOG_READ_PERMISSION } from "./list-entities.tool.ts";

const TOOL_ID = "catalog.describeEntity";

const FieldSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  pii: z.enum(["none", "personal"]),
  required: z.boolean(),
  ui: z.record(z.string(), z.unknown()).optional(),
  examples: z.array(z.unknown()).optional(),
});

const EntityDescriptionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  context: z.string(),
  kind: z.string(),
  description: z.string(),
  pii: z.string(),
  tenancyScope: z.string(),
  permission: z.string().optional(),
  fields: z.array(FieldSchema),
  relations: z.array(z.strictObject({ field: z.string(), target: z.string(), type: z.string() })),
  examples: z.array(z.record(z.string(), z.unknown())),
});

/**
 * `catalog.describeEntity` (spec §8.2): fields, relations, UI hints and redacted
 * examples of one contract. A hidden contract answers like an unknown one, so
 * the tool never confirms that a contract the caller cannot read exists.
 */
export const createDescribeEntityTool = (deps: { readonly catalog: AiCatalogReader }) =>
  defineCoreTool({
    id: TOOL_ID,
    description:
      "Describes one data contract: its fields (with meaning and whether they hold personal data), relations and examples. Use it before writing SQL or filling a form.",
    kind: "read",
    permission: CATALOG_READ_PERMISSION,
    inputSchema: z.strictObject({
      id: z.string().min(1).max(200).describe("Contract id from listEntities, e.g. example.Note."),
    }),
    outputSchema: EntityDescriptionSchema,
    execute: (input, ctx) => {
      const description = deps.catalog.describe({ id: input.id, permissions: new Set(ctx.agent.permissions) });
      if (description === undefined) {
        return Promise.reject(
          toolFailure(TOOL_ID, "ENTITY_NOT_FOUND", "No contract with this id is available to the user."),
        );
      }
      return Promise.resolve(description);
    },
  });
