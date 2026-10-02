import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";

/**
 * status.html pills: 14 % tint of the accent, 30 % border, full radius, 11.5 px medium text. The
 * text uses the AA-safe `-foreground` token of the accent (decision 0014 amendment); the dot and
 * icon use the raw accent (non-text, ≥ 3:1).
 */
const statusPillVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption leading-5 font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        blue: "border-blue/30 bg-blue/14 text-blue-foreground [&_[data-slot=status-mark]]:text-blue",
        emerald: "border-emerald/30 bg-emerald/14 text-emerald-foreground [&_[data-slot=status-mark]]:text-emerald",
        amber: "border-amber/30 bg-amber/14 text-amber-foreground [&_[data-slot=status-mark]]:text-amber",
        cyan: "border-cyan/30 bg-cyan/14 text-cyan-foreground [&_[data-slot=status-mark]]:text-cyan",
        violet: "border-violet/30 bg-violet/14 text-violet-foreground [&_[data-slot=status-mark]]:text-violet",
        danger: "border-destructive/32 bg-destructive/14 text-destructive-text [&_[data-slot=status-mark]]:text-destructive",
        neutral: "border-border bg-muted text-muted-foreground-strong [&_[data-slot=status-mark]]:text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type StatusTone = NonNullable<VariantProps<typeof statusPillVariants>["tone"]>;

export type StatusPillProps = Omit<ComponentProps<"span">, "children"> & {
  tone: StatusTone;
  /** The state in words — the colour is never the only signal (WCAG 1.4.1). */
  children: ReactNode;
  /** Optional icon instead of the dot (e.g. `circle-check` for done, `alert-triangle` for attention). */
  icon?: IconName;
};

/** State of an operation that changes over time (Pending, Approved). Roles/labels use `Badge` tags. */
export function StatusPill({ tone, icon, className, children, ...props }: StatusPillProps) {
  return (
    <span data-slot="status-pill" data-tone={tone} className={cn(statusPillVariants({ tone }), className)} {...props}>
      {icon === undefined ? (
        <span data-slot="status-mark" aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : (
        <span data-slot="status-mark" className="inline-flex">
          <Icon name={icon} className="size-3" />
        </span>
      )}
      {children}
    </span>
  );
}
