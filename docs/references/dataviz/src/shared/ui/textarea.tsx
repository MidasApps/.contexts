import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex w-full min-h-20 rounded-lg border border-border bg-muted/50 backdrop-blur-sm px-4 py-2 text-sm shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)] transition-all duration-300 outline-none placeholder:text-muted-foreground/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 hover:border-border hover:bg-muted/60",
        "focus-visible:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-primary/20",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
