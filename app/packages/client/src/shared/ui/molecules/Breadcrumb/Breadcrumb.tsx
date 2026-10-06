"use client";

import { ChevronRightIcon, EllipsisIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `breadcrumb`: a labelled `nav` with an ordered list; the current page is plain text with
 * `aria-current="page"` (not a disabled pseudo-link). Separators are hidden from assistive tech.
 */
export function Breadcrumb({ "aria-label": ariaLabel, ...props }: ComponentProps<"nav">) {
  const t = useTranslations("common.navigation");
  return <nav aria-label={ariaLabel ?? t("breadcrumb")} data-slot="breadcrumb" {...props} />;
}

export function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn("flex flex-wrap items-center gap-1.5 text-body break-words text-muted-foreground", className)}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li data-slot="breadcrumb-item" className={cn("inline-flex min-w-0 items-center gap-1.5", className)} {...props} />
  );
}

/** Link to an ancestor; pass the router's `Link` with `asChild`. */
export function BreadcrumbLink({ asChild = false, className, ...props }: ComponentProps<"a"> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "a";
  return (
    <Component
      data-slot="breadcrumb-link"
      className={cn(
        "truncate rounded-2xs underline-offset-4 transition-colors hover:text-foreground hover:underline",
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("truncate font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
}

/** Collapsed middle items; wrap in a DropdownMenu trigger button to reveal them. */
export function BreadcrumbEllipsis({ className, ...props }: ComponentProps<"span">) {
  const t = useTranslations("common.navigation");
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      className={cn("flex size-6 items-center justify-center", className)}
      {...props}
    >
      <EllipsisIcon className="size-4" aria-hidden="true" />
      <span className="sr-only">{t("more")}</span>
    </span>
  );
}
