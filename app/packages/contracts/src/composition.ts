// Composition root of @core/contracts: the only place that registers contracts
// and endpoints (rule `development`: module side effects live in composition.ts,
// and only run when a caller invokes the function).
import type { ContractDefinition } from "./contracts/contract.ts";
import { NoteContract } from "./contracts/example/note.schema.ts";
import type { EndpointDefinition } from "./contracts/http/endpoint.ts";
import { createEndpointRegistry, type EndpointRegistry } from "./contracts/http/endpoint-registry.ts";
import { ErrorEnvelopeContract } from "./contracts/http/envelopes.schema.ts";
import { createContractRegistry, type ContractRegistry } from "./contracts/registry.ts";

/** Every contract of the core; add new contracts here. `example.Note` is removable. */
export const CORE_CONTRACTS: readonly ContractDefinition[] = [NoteContract, ErrorEnvelopeContract];

/** Every `/v1` endpoint of the core (SP1 spec §7.3); add descriptors here. */
export const CORE_ENDPOINTS: readonly EndpointDefinition[] = [];

/** Builds a fresh registry with the core contracts (catalog scripts, apps at startup). */
export const composeCoreContracts = (extra: readonly ContractDefinition[] = []): ContractRegistry =>
  createContractRegistry([...CORE_CONTRACTS, ...extra]);

/** Builds the endpoint registry with the core endpoints plus module endpoints. */
export const composeCoreEndpoints = (extra: readonly EndpointDefinition[] = []): EndpointRegistry =>
  createEndpointRegistry([...CORE_ENDPOINTS, ...extra]);
