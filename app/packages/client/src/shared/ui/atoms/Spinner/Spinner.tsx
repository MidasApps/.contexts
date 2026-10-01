"use client";

import { Loader2Icon } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";

export type SpinnerProps = Omit<ComponentProps<"svg">, "role"> & {
  /** Accessible status text; defaults to `common.states.loading`. */
  label?: string;
  /** Hidden from assistive tech when the surrounding text already announces the state. */
  decorative?: boolean;
};

/**
 * shadcn `spinner`: a rotating icon. Standalone it is a `status` live region with a translated
 * label (the shadcn default "Loading" was hard-coded English); inside a labelled control pass
 * `decorative`. Reduced motion stops the rotation (globals.css).
 */
export function Spinner({ className, label, decorative = false, ...props }: SpinnerProps) {
  const t = useTranslations("common.states");
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "status", "aria-label": label ?? t("loading") } as const);
  return <Loader2Icon data-slot="spinner" className={cn("size-4 animate-spin", className)} {...a11y} {...props} />;
}
