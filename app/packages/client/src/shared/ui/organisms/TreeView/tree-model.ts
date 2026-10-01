/** A node of the tree (units per project, SP2 spec §8). */
export type TreeNode = {
  id: string;
  label: string;
  children?: readonly TreeNode[] | undefined;
};

/** A node as it appears in the visible (expanded) order, with its level and parent. */
export type VisibleTreeNode = {
  node: TreeNode;
  level: number;
  parentId: string | undefined;
  hasChildren: boolean;
};

/** Depth-first list of the nodes a user can currently reach with the arrow keys. */
export const visibleNodes = (
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
  level = 1,
  parentId: string | undefined = undefined,
): VisibleTreeNode[] =>
  nodes.flatMap((node) => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const self: VisibleTreeNode = { node, level, parentId, hasChildren };
    return hasChildren && expanded.has(node.id)
      ? [self, ...visibleNodes(node.children ?? [], expanded, level + 1, node.id)]
      : [self];
  });

/**
 * Type-ahead (WAI-ARIA tree pattern): the next visible node after `fromId` whose label starts
 * with `character`, wrapping around; `undefined` when none matches.
 */
export const findByTypeahead = (
  visible: readonly VisibleTreeNode[],
  fromId: string,
  character: string,
  locale: string,
): string | undefined => {
  const start = visible.findIndex((entry) => entry.node.id === fromId);
  const needle = character.toLocaleLowerCase(locale);
  const ordered = [...visible.slice(start + 1), ...visible.slice(0, start + 1)];
  return ordered.find((entry) => entry.node.label.toLocaleLowerCase(locale).startsWith(needle))?.node.id;
};
