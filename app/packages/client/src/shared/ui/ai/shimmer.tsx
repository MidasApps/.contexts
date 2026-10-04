import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * AI Elements `shimmer`: text that signals work in progress. CSS only — upstream sweeps a
 * gradient with `motion`; here the colour moves between two text tokens that both pass AA
 * (`animate-shimmer`, globals.css), so the words never dim below contrast the way an opacity
 * pulse would. The global reduced-motion rule stops it.
 */
export function Shimmer({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="shimmer"
      className={cn("animate-shimmer text-muted-foreground motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
