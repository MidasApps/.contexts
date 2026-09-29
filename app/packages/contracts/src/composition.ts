// Composition root of @core/contracts: the only place that registers contracts
// (rule `development`: module side effects live in composition.ts, and only run
// when a caller invokes the function).
import type { ContractDefinition } from "./contracts/contract.ts";
import { NoteContract } from "./contracts/example/note.schema.ts";
import { createContractRegistry, type ContractRegistry } from "./contracts/registry.ts";

/** Every contract of the core; add new contracts here. `example.Note` is removable. */
export const CORE_CONTRACTS: readonly ContractDefinition[] = [NoteContract];

/** Builds a fresh registry with the core contracts (catalog scripts, apps at startup). */
export const composeCoreContracts = (extra: readonly ContractDefinition[] = []): ContractRegistry =>
  createContractRegistry([...CORE_CONTRACTS, ...extra]);
