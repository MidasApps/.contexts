"use client";

import { useState } from "react";

/**
 * The composer's draft: kept here unless the owner controls it (`value`), and measured against the
 * limit on its trimmed text. Over the limit the text is kept; `over` says by how many characters.
 */
export const useChatDraft = ({
  value,
  onValueChange,
  maxLength,
}: {
  value: string | undefined;
  onValueChange: ((text: string) => void) | undefined;
  maxLength: number;
}) => {
  const [ownText, setOwnText] = useState("");
  const text = value ?? ownText;
  const setText = (next: string) => {
    setOwnText(next);
    onValueChange?.(next);
  };
  const trimmed = text.trim();
  const over = trimmed.length - maxLength;
  return { text, setText, trimmed, over, tooLong: over > 0 };
};
