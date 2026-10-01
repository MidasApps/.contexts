"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";

export type DataTablePaginationProps = {
  /** A previous cursor exists (the caller keeps the cursor stack). */
  hasPrevious: boolean;
  /** `meta.page.hasMore` of the current page (`contracts/api.md` §9). */
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** A page request is in flight: both buttons wait. */
  pending?: boolean;
  /** Names the navigation when a page has more than one paged list. */
  label?: string;
};

/**
 * Cursor paging (no page numbers: the API returns opaque cursors). A labelled `nav` with
 * previous/next buttons; disabled ends stay visible so the layout does not jump.
 */
export function DataTablePagination({ hasPrevious, hasNext, onPrevious, onNext, pending = false, label }: DataTablePaginationProps) {
  const t = useTranslations("common.pagination");
  return (
    <nav aria-label={label ?? t("label")} className="flex items-center justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={onPrevious} disabled={!hasPrevious || pending}>
        <ChevronLeftIcon aria-hidden="true" />
        {t("previous")}
      </Button>
      <Button variant="secondary" size="sm" onClick={onNext} disabled={!hasNext || pending}>
        {t("next")}
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </nav>
  );
}
