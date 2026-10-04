import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { type BadgeVariantProps, badgeVariants } from "./badge-variants.ts";

export type BadgeProps = ComponentProps<"span"> & BadgeVariantProps & { asChild?: boolean };

/**
 * shadcn `badge`. A numeric `count` badge needs context for screen readers: pair it with visually
 * hidden text ("3 unread") where the number alone is ambiguous.
 */
export function Badge({ className, variant = "default", asChild = false, ...props }: BadgeProps) {
  const Component = asChild ? Slot.Root : "span";
  return (
    <Component
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
