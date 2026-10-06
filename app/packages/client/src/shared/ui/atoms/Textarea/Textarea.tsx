import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { textControlClasses } from "#/shared/ui/atoms/Input/input-styles.ts";

/** shadcn `textarea` (grows with content via `field-sizing`) with the design-system text-control look. */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textControlClasses, "field-sizing-content min-h-16 px-3 py-2", className)}
      {...props}
    />
  );
}
