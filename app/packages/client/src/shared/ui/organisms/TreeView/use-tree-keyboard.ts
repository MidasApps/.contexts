"use client";

import type { KeyboardEvent } from "react";
import { findByTypeahead, type VisibleTreeNode } from "./tree-model.ts";

export type TreeKeyboardState = {
  visible: readonly VisibleTreeNode[];
  focusedId: string;
  expanded: ReadonlySet<string>;
  locale: string;
  focus: (id: string) => void;
  setExpanded: (id: string, open: boolean) => void;
  select: (id: string) => void;
};

const moveTo = (state: TreeKeyboardState, index: number): void => {
  const target = state.visible[Math.max(0, Math.min(index, state.visible.length - 1))];
  if (target !== undefined) state.focus(target.node.id);
};

const onArrowRight = (state: TreeKeyboardState, current: VisibleTreeNode, index: number): void => {
  if (!current.hasChildren) return;
  if (!state.expanded.has(current.node.id)) state.setExpanded(current.node.id, true);
  else moveTo(state, index + 1);
};

const onArrowLeft = (state: TreeKeyboardState, current: VisibleTreeNode): void => {
  if (current.hasChildren && state.expanded.has(current.node.id)) state.setExpanded(current.node.id, false);
  else if (current.parentId !== undefined) state.focus(current.parentId);
};

/**
 * Keyboard model of the WAI-ARIA tree pattern: ↑/↓ move through visible items, → expands or enters,
 * ← collapses or goes to the parent, Home/End jump, Enter/Space select, a printable character
 * jumps to the next item starting with it (type-ahead). Tab leaves the tree (one tab stop).
 *
 * @returns `true` when the key was handled (the caller prevents the default).
 */
export const handleTreeKey = (event: KeyboardEvent, state: TreeKeyboardState): boolean => {
  const index = state.visible.findIndex((entry) => entry.node.id === state.focusedId);
  const current = state.visible[index];
  if (current === undefined) return false;
  switch (event.key) {
    case "ArrowDown":
      moveTo(state, index + 1);
      return true;
    case "ArrowUp":
      moveTo(state, index - 1);
      return true;
    case "ArrowRight":
      onArrowRight(state, current, index);
      return true;
    case "ArrowLeft":
      onArrowLeft(state, current);
      return true;
    case "Home":
      moveTo(state, 0);
      return true;
    case "End":
      moveTo(state, state.visible.length - 1);
      return true;
    case "Enter":
    case " ":
      state.select(current.node.id);
      return true;
    default:
      break;
  }
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const match = findByTypeahead(state.visible, current.node.id, event.key, state.locale);
  if (match !== undefined) state.focus(match);
  return true;
};
