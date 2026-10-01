"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";

export type LoadingStateProps = Omit<ComponentProps<"div">, "children"> & {
  /** What is loading, for assistive tech; defaults to `common.states.loading`. */
  label?: string;
  /** `skeleton` keeps the layout stable (lists, cards); `spinner` for small or unknown shapes. */
  variant?: "skeleton" | "spinner";
  /** Skeleton rows. */
  rows?: number;
};

const ROW_WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-2/3"] as const;

/**
 * Loading placeholder for any region (SP2 spec §9 "loading skeletons"). A polite `status` with
 * `aria-busy` names what is loading; the skeleton bars are hidden from assistive tech so the
 * announcement is said once.
 */
export function LoadingState({ label, variant = "skeleton", rows = 3, className, ...props }: LoadingStateProps) {
  const t = useTranslations("common.states");
  const text = label ?? t("loading");
  return (
    <div role="status" aria-busy="true" data-state="loading" className={cn("w-full", className)} {...props}>
      {variant === "spinner" ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Spinner decorative className="size-5" />
          <span>{text}</span>
        </div>
      ) : (
        <>
          <span className="sr-only">{text}</span>
          <div className="flex flex-col gap-3">
            {Array.from({ length: rows }, (_, index) => (
              <Skeleton key={index} className={cn("h-4", ROW_WIDTHS[index % ROW_WIDTHS.length])} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
