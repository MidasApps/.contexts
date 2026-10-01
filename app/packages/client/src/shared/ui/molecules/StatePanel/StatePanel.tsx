import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";

export type StatePanelProps = Omit<ComponentProps<"div">, "title"> & {
  icon: IconName;
  title: ReactNode;
  description?: ReactNode;
  /** One primary action (empty.html: one action; never decorative illustrations). */
  action?: ReactNode;
  /** Heading level that fits the page outline (default h2 under the page h1). */
  headingLevel?: 2 | 3 | 4;
  /** `dashed` = empty.html border; `plain` for states inside cards/tables. */
  frame?: "dashed" | "plain";
  /** Tints the glyph (errors use destructive; access uses amber). */
  tone?: "neutral" | "destructive" | "amber";
};

const GLYPH_TONES = {
  neutral: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/14 text-destructive",
  amber: "bg-amber/14 text-amber",
} as const;

/**
 * Shared layout of the page-state molecules (EmptyState, ErrorState, NoAccessState), from
 * empty.html: centred, dashed hairline, 48 px square glyph, short semibold title, one-line muted
 * description, one action.
 */
export function StatePanel({
  icon,
  title,
  description,
  action,
  headingLevel = 2,
  frame = "dashed",
  tone = "neutral",
  className,
  children,
  ...props
}: StatePanelProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      data-slot="state-panel"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-10 text-center",
        frame === "dashed" && "rounded-lg border border-dashed border-border",
        className,
      )}
      {...props}
    >
      <span className={cn("mb-3.5 grid size-12 place-items-center rounded-lg", GLYPH_TONES[tone])}>
        <Icon name={icon} className="size-5" />
      </span>
      <Heading className="text-[14.5px] leading-snug font-semibold">{title}</Heading>
      {description === undefined ? null : (
        <p className="mt-1 max-w-sm text-[12.5px] leading-normal text-muted-foreground">{description}</p>
      )}
      {children}
      {action === undefined ? null : <div className="mt-3.5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
