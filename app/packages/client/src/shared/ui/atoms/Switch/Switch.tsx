"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & { size?: "sm" | "default" };

/**
 * shadcn `switch` (Radix `role="switch"`; Space toggles). Design system (formularios.html): 34 × 20
 * track, `--muted` off with a `--foreground` thumb, `--sidebar-primary` on with a white thumb.
 * The thumb carries the ≥ 3:1 contrast in both states; `after:` widens the target to 24 px high.
 */
export function Switch({ className, size = "default", ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent",
        "after:absolute after:-inset-x-0.5 after:-inset-y-1 after:content-['']",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "data-[size=default]:h-5 data-[size=default]:w-[34px] data-[size=sm]:h-4 data-[size=sm]:w-7",
        "data-[state=checked]:bg-sidebar-primary data-[state=unchecked]:bg-muted data-[state=unchecked]:border-border",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full transition-transform",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          "data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-foreground",
          "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-sidebar-primary-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
