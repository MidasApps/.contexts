"use client";

import { ChevronRightIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { visibleNodes, type TreeNode } from "./tree-model.ts";
import { handleTreeKey } from "./use-tree-keyboard.ts";

export type TreeViewProps = {
  /** Accessible name of the tree (e.g. "Units of Project X"). */
  label: string;
  nodes: readonly TreeNode[];
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  defaultExpandedIds?: readonly string[];
  /** Extra content after a node's label (counts, status pills); must not be interactive. */
  renderMeta?: (node: TreeNode) => ReactNode;
  className?: string;
};

type ItemProps = {
  node: TreeNode;
  level: number;
  tree: {
    idPrefix: string;
    expanded: ReadonlySet<string>;
    focusedId: string;
    selectedId: string | undefined;
    register: (id: string, element: HTMLLIElement | null) => void;
    toggle: (id: string) => void;
    activate: (id: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
    renderMeta: ((node: TreeNode) => ReactNode) | undefined;
  };
};

function TreeItem({ node, level, tree }: ItemProps) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const open = hasChildren && tree.expanded.has(node.id);
  const labelId = `${tree.idPrefix}-${node.id}-label`;
  return (
    <li
      ref={(element) => tree.register(node.id, element)}
      role="treeitem"
      aria-level={level}
      aria-expanded={hasChildren ? open : undefined}
      aria-selected={tree.selectedId === node.id}
      aria-labelledby={labelId}
      tabIndex={tree.focusedId === node.id ? 0 : -1}
      className="rounded-xs outline-none focus-visible:[&>[data-slot=tree-row]]:outline-2 focus-visible:[&>[data-slot=tree-row]]:-outline-offset-2 focus-visible:[&>[data-slot=tree-row]]:outline-ring"
      onKeyDown={tree.onKeyDown}
      onClick={(event) => {
        // Nested items bubble to their ancestors; only the innermost handles the click.
        event.stopPropagation();
        const onToggle = event.target instanceof Element && event.target.closest("[data-slot=tree-toggle]") !== null;
        if (onToggle) tree.toggle(node.id);
        else tree.activate(node.id);
      }}
    >
      <div
        data-slot="tree-row"
        style={{ paddingInlineStart: `${(level - 1) * 16 + 4}px` }}
        className={cn(
          "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-xs pr-2 text-[13px] hover:bg-muted",
          tree.selectedId === node.id && "bg-accent font-medium text-accent-foreground",
        )}
      >
        <span
          aria-hidden="true"
          data-slot="tree-toggle"
          className={cn("grid size-6 shrink-0 place-items-center text-muted-foreground", !hasChildren && "invisible")}
        >
          <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
        </span>
        <span id={labelId} className="truncate">
          {node.label}
        </span>
        {tree.renderMeta?.(node)}
      </div>
      {open ? (
        <ul role="group">
          {node.children?.map((child) => (
            <TreeItem key={child.id} node={child} level={level + 1} tree={tree} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * WAI-ARIA tree (units per project): one tab stop with roving `tabindex`, full keyboard model
 * (`handleTreeKey`), `aria-level`/`aria-expanded`/`aria-selected`, names from the label only
 * (children excluded). The chevron is a pointer affordance; keyboard users use ←/→.
 */
export function TreeView({ label, nodes, selectedId, onSelect, defaultExpandedIds = [], renderMeta, className }: TreeViewProps) {
  const idPrefix = useId();
  const locale = useLocale();
  const [expanded, setExpandedSet] = useState<ReadonlySet<string>>(() => new Set(defaultExpandedIds));
  const [focusedId, setFocusedId] = useState(() => selectedId ?? nodes[0]?.id ?? "");
  // DOM focus follows `focusedId` after the render that shows the target (it may have just expanded).
  const pendingFocus = useRef<string | null>(null);
  const elements = useRef(new Map<string, HTMLLIElement>());
  const visible = useMemo(() => visibleNodes(nodes, expanded), [nodes, expanded]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    elements.current.get(target)?.focus();
  });

  const focus = (id: string): void => {
    pendingFocus.current = id;
    setFocusedId(id);
    elements.current.get(id)?.focus();
  };
  const setExpanded = (id: string, open: boolean): void =>
    setExpandedSet((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const tree: ItemProps["tree"] = {
    idPrefix,
    expanded,
    focusedId,
    selectedId,
    renderMeta,
    register: (id, element) => {
      if (element === null) elements.current.delete(id);
      else elements.current.set(id, element);
    },
    toggle: (id) => setExpanded(id, !expanded.has(id)),
    activate: (id) => {
      focus(id);
      onSelect(id);
    },
    onKeyDown: (event) => {
      event.stopPropagation();
      const handled = handleTreeKey(event, { visible, focusedId, expanded, locale, focus, setExpanded, select: onSelect });
      if (handled) event.preventDefault();
    },
  };

  return (
    <ul
      role="tree"
      aria-label={label}
      className={cn("flex flex-col gap-0.5", className)}
    >
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} level={1} tree={tree} />
      ))}
    </ul>
  );
}
