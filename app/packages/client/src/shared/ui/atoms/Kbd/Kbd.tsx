import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `kbd` in the design-system look (componentes.html, atalhos.html): mono 11 px on the page
 * background with a hairline border and 6 px radius. Text uses `--muted-foreground-strong` so it
 * stays AA on muted surfaces too.
 */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-2xs border border-border bg-background px-1.5",
        "font-mono text-label font-medium text-muted-foreground-strong select-none",
        "[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

/** Groups the keys of one shortcut (`⌘` `K`); a single `kbd` element as HTML nests them. */
export function KbdGroup({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}
