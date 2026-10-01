import type { LucideProps } from "lucide-react";
import { cn } from "#/shared/lib/cn.ts";
import { ICONS, type IconName } from "./icon-registry.ts";

export type IconProps = Omit<LucideProps, "ref" | "aria-label" | "aria-hidden" | "role"> & {
  name: IconName;
  /**
   * Accessible name when the icon carries meaning on its own. Without it the icon is decorative
   * (`aria-hidden`), which is the right default next to visible text.
   */
  label?: string | undefined;
};

/** Lucide icon by allowlisted name (see `icon-registry.ts`). */
export function Icon({ name, label, className, ...props }: IconProps) {
  const Glyph = ICONS[name];
  const a11y = label === undefined ? ({ "aria-hidden": true } as const) : ({ role: "img", "aria-label": label } as const);
  return <Glyph data-slot="icon" data-icon={name} className={cn("size-4 shrink-0", className)} focusable="false" {...a11y} {...props} />;
}
