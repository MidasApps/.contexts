"use client";

import { type ClipboardEvent, type DragEvent, useState } from "react";

/**
 * Pasted or dropped files join the message like picked ones; plain pasted text stays text.
 * Without `onFiles` (no upload permission, offline) files are ignored and nothing highlights.
 */
export const useComposerFileDrop = (onFiles: ((files: readonly File[]) => void) | undefined) => {
  const [dragging, setDragging] = useState(false);
  const carriesFiles = (types: readonly string[]): boolean => onFiles !== undefined && types.includes("Files");
  const onPaste = (event: ClipboardEvent<HTMLFormElement>) => {
    const files = [...event.clipboardData.files];
    if (onFiles === undefined || files.length === 0) return;
    event.preventDefault();
    onFiles(files);
  };
  const onDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!carriesFiles([...event.dataTransfer.types])) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    setDragging(false);
    if (!carriesFiles([...event.dataTransfer.types])) return;
    event.preventDefault();
    onFiles?.([...event.dataTransfer.files]);
  };
  return { dragging, onPaste, onDragOver, onDragLeave, onDrop };
};
