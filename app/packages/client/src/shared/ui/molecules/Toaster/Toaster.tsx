"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster as Sonner } from "sonner";
import { useTranslations } from "use-intl";

const tinted = (classes: string, icon: ReactNode) => (
  <span className={`grid size-7 place-items-center rounded-xs ${classes}`}>{icon}</span>
);

// toasts.html: 28 px tinted icon square (20 % of the accent), the glyph in the raw accent.
const ICONS = {
  success: tinted("bg-emerald/20 text-emerald", <CircleCheckIcon className="size-4" aria-hidden="true" />),
  info: tinted("bg-blue/20 text-blue", <InfoIcon className="size-4" aria-hidden="true" />),
  warning: tinted("bg-amber/20 text-amber", <TriangleAlertIcon className="size-4" aria-hidden="true" />),
  error: tinted("bg-destructive/20 text-destructive", <OctagonXIcon className="size-4" aria-hidden="true" />),
  loading: tinted("bg-muted text-muted-foreground", <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />),
};

const CLASS_NAMES = {
  toast:
    "group flex w-(--width) items-start gap-3 rounded-md border border-border bg-card px-3.5 py-3 text-card-foreground shadow-popover",
  content: "flex min-w-0 flex-1 flex-col gap-0.5",
  title: "text-body leading-snug font-semibold",
  description: "text-body-sm leading-snug text-muted-foreground",
  icon: "shrink-0",
  actionButton:
    "ms-auto shrink-0 cursor-pointer self-center rounded-xs bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90",
  cancelButton: "shrink-0 cursor-pointer self-center rounded-xs px-2.5 py-1 text-xs font-medium hover:bg-muted",
  closeButton:
    "absolute top-2 end-2 grid size-6 cursor-pointer place-items-center rounded-2xs text-muted-foreground hover:bg-muted hover:text-foreground",
};

export type ToasterProps = {
  /** Theme from the app's theme provider (`next-themes`); tokens already follow `data-theme`. */
  theme?: "light" | "dark" | "system";
};

/**
 * shadcn `sonner` Toaster in the toasts.html look: top-right, `--card` surface, tinted icon,
 * 13 px title and muted body. Sonner's region is a polite live region with a translated label;
 * use `notify` (./notify.ts) so errors persist until dismissed and successes last 4 s.
 */
export function Toaster({ theme = "system" }: ToasterProps) {
  const t = useTranslations("common.notifications");
  return (
    <Sonner
      theme={theme}
      position="top-right"
      duration={4000}
      icons={ICONS}
      containerAriaLabel={t("region")}
      toastOptions={{ unstyled: true, classNames: CLASS_NAMES, closeButtonAriaLabel: t("dismiss") }}
    />
  );
}
