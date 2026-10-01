"use client";

import { Fragment } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { VisuallyHidden } from "#/shared/ui/atoms/VisuallyHidden/VisuallyHidden.tsx";

export type UnitBreadcrumbProps = {
  /** Root first; `name: null` for an ancestor the viewer cannot see (or still loading). */
  path: readonly { readonly id: string; readonly name: string | null }[];
  className?: string;
};

/**
 * Compact unit path ("Site › Floor 2 › Room 101") for pickers and headers. Phrasing content only,
 * so it can sit inside a button; the chevrons are decorative and a comma is spoken instead.
 */
export function UnitBreadcrumb({ path, className }: UnitBreadcrumbProps) {
  const t = useTranslations("shell.units");
  return (
    <span data-slot="unit-breadcrumb" className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {path.map((segment, index) => (
        <Fragment key={segment.id}>
          {index === 0 ? null : (
            <>
              <Icon name="chevron-right" className="size-3 shrink-0 text-muted-foreground" />
              <VisuallyHidden>, </VisuallyHidden>
            </>
          )}
          <span className={cn("truncate", index === path.length - 1 ? "font-medium" : "text-muted-foreground")}>{segment.name ?? t("hiddenUnit")}</span>
        </Fragment>
      ))}
    </span>
  );
}
