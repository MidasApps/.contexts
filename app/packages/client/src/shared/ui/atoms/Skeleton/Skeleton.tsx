import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `skeleton`: a placeholder block in `--muted` that pulses (DESIGN.md allows a shimmer only
 * for loading). It is hidden from assistive tech — the region that is loading announces it
 * (`aria-busy` + a `status` text, see the `LoadingState` molecule). Reduced motion stops the pulse.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("animate-pulse rounded-sm bg-muted", className)} {...props} />;
}
