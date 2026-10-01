"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { SearchField } from "#/shared/ui/molecules/SearchField/SearchField.tsx";

export type HistorySearchProps = {
  /** Called with the trimmed words once typing pauses; pass a stable function (a state setter). */
  onSearch: (q: string) => void;
  /** Pause before searching (SP4 plan Task 13: 300 ms). */
  delayMs?: number | undefined;
  className?: string | undefined;
};

export const HISTORY_SEARCH_DELAY_MS = 300;

/**
 * Search box of the conversation history: the list is filtered on the server (`q` matches title
 * and summary words), so each keystroke is not a request — the search runs after a pause.
 */
export function HistorySearch({ onSearch, delayMs = HISTORY_SEARCH_DELAY_MS, className }: HistorySearchProps) {
  const t = useTranslations("chat.history");
  const [text, setText] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => onSearch(text.trim()), delayMs);
    return () => clearTimeout(timer);
  }, [text, delayMs, onSearch]);
  return <SearchField value={text} onValueChange={setText} label={t("searchLabel")} placeholder={t("searchPlaceholder")} className={className} />;
}
