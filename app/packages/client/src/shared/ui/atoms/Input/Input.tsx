import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { textControlClasses } from "./input-styles.ts";

/** shadcn `input` restyled with the design-system text-control look. Label it (Label or Field). */
export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        textControlClasses,
        "h-9 px-3 py-2",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
