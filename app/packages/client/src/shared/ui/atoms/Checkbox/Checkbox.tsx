"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `checkbox` (Radix; Space toggles). Design system: checked state in `--sidebar-primary`
 * (formularios.html). The unchecked border uses `--muted-foreground` because the box outline is
 * the only thing identifying the control (WCAG 1.4.11 needs ≥ 3:1; `--input` is ~1.4:1). The
 * `after:` layer widens the pointer target to 24 × 24 px (WCAG 2.5.8) without changing the look.
 */
export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative size-4 shrink-0 cursor-pointer rounded-[5px] border border-muted-foreground bg-background",
        "after:absolute after:-inset-1 after:content-['']",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        "data-[state=checked]:border-sidebar-primary data-[state=checked]:bg-sidebar-primary data-[state=checked]:text-sidebar-primary-foreground",
        "data-[state=indeterminate]:border-sidebar-primary data-[state=indeterminate]:bg-sidebar-primary data-[state=indeterminate]:text-sidebar-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current">
        {props.checked === "indeterminate" ? <MinusIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
