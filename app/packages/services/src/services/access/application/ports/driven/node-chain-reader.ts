import type { TenantNodeRef } from "@core/contracts";
import type { NodeChain } from "../../../domain/node-chain.ts";

/**
 * Loads the chain organization → project → unit ancestors → unit of a node
 * (`units.ancestorIds`), soft-deleted nodes included so `authorize()` can deny them.
 * @returns null when any node of the chain does not exist.
 */
export type NodeChainReader = {
  readonly loadChain: (node: TenantNodeRef) => Promise<NodeChain | null>;
};
