import type { OrganizationStatus, ProjectId, TenantId, TenantNodeRef } from "@core/contracts";
import type { DenyReason } from "./authorization.ts";

/** One node of a chain as stored: soft-delete and tenant are checked by `checkNodeChain`. */
export type ChainNode = { readonly id: string; readonly tenantId: TenantId; readonly isDeleted: boolean };

export type ChainUnit = ChainNode & { readonly projectId: ProjectId };

/**
 * The path from the organization down to a node (SP1 spec §5.2 step 2): the
 * organization, the project (project and unit nodes) and the units root → leaf
 * (unit nodes; the last one is the node itself).
 */
export type NodeChain = {
  readonly organization: ChainNode & { readonly status: OrganizationStatus };
  readonly project?: ChainNode;
  readonly units: readonly ChainUnit[];
};

/** Ids of every node of the chain, organization first: grants on any of them apply. */
export const chainNodeIds = (chain: NodeChain): readonly string[] => [
  chain.organization.id,
  ...(chain.project === undefined ? [] : [chain.project.id]),
  ...chain.units.map((unit) => unit.id),
];

const allNodes = (chain: NodeChain): readonly ChainNode[] => [
  chain.organization,
  ...(chain.project === undefined ? [] : [chain.project]),
  ...chain.units,
];

// The chain must describe exactly the requested node: a reader bug or a stale tree
// must deny, never widen access (decision 0006 §4, unmapped resource denied).
const matchesNode = (node: TenantNodeRef, chain: NodeChain): boolean => {
  if (chain.organization.id !== node.tenantId) return false;
  if (node.level === "organization") return chain.project === undefined && chain.units.length === 0;
  if (chain.project?.id !== node.projectId) return false;
  if (node.level === "project") return chain.units.length === 0;
  return chain.units.at(-1)?.id === node.unitId && chain.units.every((unit) => unit.projectId === node.projectId);
};

/**
 * Checks that a loaded chain is usable for `node`.
 * @returns the deny reason, or null when the chain is consistent, alive and active.
 */
export const checkNodeChain = (node: TenantNodeRef, chain: NodeChain): DenyReason | null => {
  if (!matchesNode(node, chain)) return "NODE_NOT_FOUND";
  const nodes = allNodes(chain);
  if (nodes.some((entry) => entry.tenantId !== node.tenantId || entry.isDeleted)) return "NODE_NOT_FOUND";
  return chain.organization.status === "active" ? null : "ORGANIZATION_SUSPENDED";
};

/** Whether `inner` is `outer` or below it (API key node limits). */
export const isNodeWithin = (args: { inner: NodeChain; outer: TenantNodeRef }): boolean => {
  const { inner, outer } = args;
  if (inner.organization.id !== outer.tenantId) return false;
  if (outer.level === "organization") return true;
  if (inner.project?.id !== outer.projectId) return false;
  return outer.level === "project" || inner.units.some((unit) => unit.id === outer.unitId);
};
