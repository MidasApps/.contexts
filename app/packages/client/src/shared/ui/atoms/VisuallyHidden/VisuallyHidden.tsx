import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type VisuallyHiddenProps = ComponentProps<"span"> & {
  asChild?: boolean;
  /** Becomes visible while focused (skip links; rules/accessibility.md "Skip links"). */
  focusable?: boolean;
};

/**
 * Text for assistive tech only (`sr-only`, never `display: none`, so it stays in the
 * accessibility tree). With `focusable` it reappears on focus.
 */
export function VisuallyHidden({ className, asChild = false, focusable = false, ...props }: VisuallyHiddenProps) {
  const Component = asChild ? Slot.Root : "span";
  return (
    <Component
      data-slot="visually-hidden"
      className={cn("sr-only", focusable && "focus:not-sr-only focus-visible:not-sr-only", className)}
      {...props}
    />
  );
}
