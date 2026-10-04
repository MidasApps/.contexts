import { ContractIdSchema, ToolUiSchema } from "@core/contracts";
import { z } from "zod";
import type { AccessPort } from "../../runtime/runtime-ports.ts";
import { type CoreToolContext, defineCoreTool } from "../define-core-tool.ts";
import { commandToolIdOf } from "../commands/command-tools.ts";
import { CoreToolError, toolFailure } from "../tool-errors.ts";
import type { AiCatalogReader } from "./ai-catalog-reader.ts";
import { CATALOG_READ_PERMISSION } from "./list-entities.tool.ts";

const TOOL_ID = "catalog.renderForm";
export const SCHEMA_FORM_COMPONENT = "schema-form";

/** A command the chat can render as a form (registered by modules, Task 19). */
export type FormCommand = {
  readonly commandId: string;
  /** Contract the command creates or updates. */
  readonly targetContractId: string;
  readonly permission: string;
  readonly inputSchema: z.ZodObject;
};

export type FormCommandCatalog = { readonly get: (commandId: string) => FormCommand | undefined };

/** Keeps only fields the command declares whose value passes that field's schema. */
const filterInitialValues = (schema: z.ZodObject, values: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(values).filter(([key, value]) => {
      const field = schema.shape[key] as z.ZodType | undefined;
      return field !== undefined && field.safeParse(value).success;
    }),
  );

const assertCommandAllowed = async (access: AccessPort, command: FormCommand, ctx: CoreToolContext): Promise<void> => {
  const decision = await access
    .authorize({ principal: ctx.principal, permission: command.permission, node: ctx.node, ceiling: new Set(ctx.agent.permissions) })
    .catch((error: unknown) => {
      throw new CoreToolError({ code: "AUTHORIZATION_UNAVAILABLE", toolId: TOOL_ID }, { cause: error });
    });
  if (!decision.allowed) throw new CoreToolError({ code: "FORBIDDEN", toolId: TOOL_ID, details: { reason: decision.reason } });
};

const resolveCommand = async (deps: RenderFormDeps, input: { commandId: string; contractId: string }, ctx: CoreToolContext): Promise<FormCommand> => {
  const command = deps.commands.get(input.commandId);
  // A command of a module the tenant did not enable answers like an unknown one (decision 0064).
  const offered = command !== undefined && (deps.isCommandOffered === undefined || (await deps.isCommandOffered(commandToolIdOf(command.commandId), ctx)));
  if (command === undefined || !offered) throw toolFailure(TOOL_ID, "COMMAND_NOT_FOUND", "No command with this id is registered.");
  if (command.targetContractId !== input.contractId) {
    throw toolFailure(TOOL_ID, "COMMAND_CONTRACT_MISMATCH", "This command does not create or update that contract.");
  }
  if (deps.catalog.describe({ id: input.contractId, permissions: new Set(ctx.agent.permissions) }) === undefined) {
    throw toolFailure(TOOL_ID, "ENTITY_NOT_FOUND", "No contract with this id is available to the user.");
  }
  return command;
};

export type RenderFormDeps = {
  readonly catalog: AiCatalogReader;
  readonly commands: FormCommandCatalog;
  readonly access: AccessPort;
  /** False for a command of a module the run's tenant did not enable; absent: every command is offered. */
  readonly isCommandOffered?: (toolId: string, ctx: CoreToolContext) => Promise<boolean>;
};

/**
 * `catalog.renderForm` (spec §8.2): asks the chat to render `SchemaForm` for a
 * command. It writes nothing; the user's submission comes back as the tool
 * output and the agent then calls the command tool, which asks for confirmation.
 */
export const createRenderFormTool = (deps: RenderFormDeps) =>
  defineCoreTool({
    id: TOOL_ID,
    description:
      "Shows the user a form to create or update a record through a command. Use it when the user wants to create or change data; it does not save anything.",
    kind: "read",
    permission: CATALOG_READ_PERMISSION,
    inputSchema: z.strictObject({
      contractId: ContractIdSchema.describe("Contract the form is about, e.g. example.Note."),
      mode: z.enum(["create", "update"]).describe("Whether the form creates a record or updates one."),
      commandId: ContractIdSchema.describe("Command contract that will save the form, e.g. example.CreateNoteCommand."),
      initialValues: z.record(z.string(), z.unknown()).optional().describe("Values to prefill; unknown or invalid fields are dropped."),
    }),
    outputSchema: z.strictObject({ ui: ToolUiSchema }),
    ui: { component: SCHEMA_FORM_COMPONENT },
    execute: async (input, ctx) => {
      const command = await resolveCommand(deps, input, ctx);
      await assertCommandAllowed(deps.access, command, ctx);
      const initialValues = filterInitialValues(command.inputSchema, input.initialValues ?? {});
      const props = { contractId: input.contractId, commandId: input.commandId, mode: input.mode, initialValues };
      return { ui: { component: SCHEMA_FORM_COMPONENT, props } };
    },
  });
