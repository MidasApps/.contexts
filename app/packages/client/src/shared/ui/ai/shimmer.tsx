import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * AI Elements `shimmer`: text with a moving highlight for work in progress (DESIGN.md allows a
 * gradient only for loading). CSS only — upstream animates with `motion`; here the pulse comes
 * from `animate-pulse`, which the global reduced-motion rule stops.
 */
export function Shimmer({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="shimmer" className={cn("animate-pulse text-muted-foreground motion-reduce:animate-none", className)} {...props} />;
}
