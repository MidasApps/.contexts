import type { ContractDefinition } from "@core/contracts";
import { z } from "zod";
import type { AgentCommandExecution, AgentCommandExecutor } from "./agent-command-executor.ts";

/** What approvers see before a command runs (never secrets). */
export type CommandPreview = { readonly before: unknown; readonly after: unknown };

/** The typed declaration of a command of the registry (`defineContractCommand`). */
export type ContractCommandSpec<Schema extends z.ZodObject, Output extends z.ZodType> = {
  /** Command contract (`kind: "command"` with a `permission`): id, description and input schema come from it. */
  readonly contract: ContractDefinition<Schema>;
  /** Contract the command creates or changes (`example.Note`); forms are rendered from it. */
  readonly targetContractId: string;
  readonly outputSchema: Output;
  /** @throws {AgentCommandError} `COMMAND_REFUSED` when the use case refuses; infrastructure errors propagate. */
  execute(execution: AgentCommandExecution<z.output<Schema>>): Promise<z.input<Output>>;
  /** One line for approvers (no secrets, no free text beyond a title). */
  readonly summarize?: (input: z.output<Schema>) => string;
  readonly preview?: (input: z.output<Schema>) => CommandPreview;
};

/**
 * One entry of the command registry (decision 0025): the single definition of a command.
 * The SP1 `agent-command` approval handler and the workflow command port run it as an
 * executor; `@core/agents` derives the agent tool `command.<commandId>` from the same value,
 * so tool, form, approval and workflow share one schema, permission and use case.
 */
export type ContractCommand = AgentCommandExecutor & {
  readonly description: string;
  readonly inputSchema: z.ZodObject;
  readonly outputSchema: z.ZodType;
  readonly targetContractId: string;
  readonly summarize?: (input: unknown) => string;
  readonly preview?: (input: unknown) => CommandPreview;
};

export type CommandContractErrorCode = "COMMAND_KIND_INVALID" | "COMMAND_PERMISSION_MISSING" | "COMMAND_SCHEMA_INVALID";

/** Boot error: a contract cannot back a command (decision 0025 §1). */
export class CommandContractError extends Error {
  readonly code: CommandContractErrorCode;
  readonly contractId: string;

  constructor(code: CommandContractErrorCode, contractId: string) {
    super(`${code}: ${contractId}`);
    this.name = "CommandContractError";
    this.code = code;
    this.contractId = contractId;
  }
}

/**
 * Declares a command from its contract.
 * @throws {CommandContractError} when the contract is not `kind: "command"`, has no
 *   `permission` or its schema is not an object (boot error by design).
 */
export const defineContractCommand = <Schema extends z.ZodObject, Output extends z.ZodType>(
  spec: ContractCommandSpec<Schema, Output>,
): ContractCommand => {
  const { contract } = spec;
  if (contract.meta.kind !== "command") throw new CommandContractError("COMMAND_KIND_INVALID", contract.id);
  const permission = contract.meta.permission;
  if (permission === undefined) throw new CommandContractError("COMMAND_PERMISSION_MISSING", contract.id);
  if (!(contract.schema instanceof z.ZodObject)) throw new CommandContractError("COMMAND_SCHEMA_INVALID", contract.id);
  const executor: AgentCommandExecutor = {
    commandId: contract.id,
    permission,
    prepare: (input) => {
      const parsed = contract.schema.safeParse(input);
      if (!parsed.success) return null;
      return (execution) => spec.execute({ ...execution, input: parsed.data });
    },
  };
  const { summarize, preview } = spec;
  return {
    ...executor,
    description: contract.meta.description,
    inputSchema: contract.schema,
    outputSchema: spec.outputSchema,
    targetContractId: spec.targetContractId,
    ...(summarize === undefined ? {} : { summarize: (input: unknown) => summarize(contract.schema.parse(input)) }),
    ...(preview === undefined ? {} : { preview: (input: unknown) => preview(contract.schema.parse(input)) }),
  };
};
