import { z } from "zod";
import type { ContractDefinition } from "./contract.ts";
import { ContractDefinitionError } from "./contract-definition-error.ts";

/** Kept for callers that name the listed item; a registered contract is its definition. */
export type RegisteredContract = ContractDefinition;

export type ContractRegistry = {
  readonly register: (definition: ContractDefinition) => void;
  readonly listContracts: () => RegisteredContract[];
};

const compareIds = (left: RegisteredContract, right: RegisteredContract): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

/**
 * Catalog of contracts built by an explicit composition step. Zod's registry is
 * not enumerable and accepts repeated ids, so the catalog keeps its own maps.
 * Registration also writes the meta to `z.globalRegistry` (same instance), which
 * `z.toJSONSchema` reads.
 */
export const createContractRegistry = (definitions: readonly ContractDefinition[] = []): ContractRegistry => {
  const byId = new Map<string, RegisteredContract>();
  const idBySchema = new Map<z.ZodType, string>();

  const register = (definition: ContractDefinition): void => {
    if (byId.has(definition.id)) {
      throw new ContractDefinitionError({
        code: "DUPLICATE_CONTRACT_ID",
        contractId: definition.id,
        message: `Contract ${definition.id} is already registered.`,
      });
    }
    const existingId = idBySchema.get(definition.schema);
    if (existingId !== undefined) {
      throw new ContractDefinitionError({
        code: "DUPLICATE_CONTRACT_SCHEMA",
        contractId: definition.id,
        message: `Schema of ${definition.id} is already registered as ${existingId}.`,
      });
    }
    z.globalRegistry.add(definition.schema, definition.meta);
    byId.set(definition.id, definition);
    idBySchema.set(definition.schema, definition.id);
  };

  for (const definition of definitions) register(definition);

  return { register, listContracts: () => [...byId.values()].sort(compareIds) };
};
