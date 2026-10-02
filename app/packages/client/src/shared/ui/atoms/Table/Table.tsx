import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `table` in the design-system look (demo.html `table.t`): 13 px rows with hairline
 * separators, headers in 11.5 px uppercase muted, numeric cells in mono aligned to the end. The
 * wrapper scrolls horizontally on narrow screens and is focusable so keyboard users can scroll it.
 * Data tables need a `TableCaption` (or `aria-labelledby`) and `scope` on header cells.
 */
export function Table({ className, scrollLabel, ...props }: ComponentProps<"table"> & {
  /**
   * Name of the scroll container. When given, the container becomes a focusable, labelled region so
   * keyboard users can scroll a wide table (axe `scrollable-region-focusable`); pass the caption.
   */
  scrollLabel?: string | undefined;
}) {
  const scrollable = scrollLabel === undefined ? {} : ({ tabIndex: 0, role: "region", "aria-label": scrollLabel } as const);
  return (
    <div
      data-slot="table-container"
      {...scrollable}
      className="relative w-full overflow-x-auto rounded-md focus-visible:outline-offset-2"
    >
      <table data-slot="table" className={cn("w-full caption-top border-collapse text-body", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("border-t border-border bg-muted/50 font-medium", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  );
}

/** Header cell; `scope="col"` by default (rules/accessibility.md "Tabelas de dados"). */
export function TableHead({ className, scope = "col", ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn(
        "h-9 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground",
        "text-caption tracking-[0.06em] uppercase [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />;
}

/** Table title for assistive tech and sighted users; use `className="sr-only"` when a heading already shows it. */
export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mb-3 text-left text-sm text-muted-foreground", className)} {...props} />;
}
