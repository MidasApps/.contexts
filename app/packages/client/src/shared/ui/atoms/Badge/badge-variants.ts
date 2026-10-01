import { cva, type VariantProps } from "class-variance-authority";

/**
 * Badge looks (shadcn `badge` + avatar.html "role tags" + navegacao.html "contador"):
 * - `default`/`secondary`/`outline`/`destructive`: shadcn pills on the design tokens;
 * - `count`: numeric pill in `--sidebar-primary` with white mono digits (new items);
 * - `tag`, `tag-blue`, `tag-violet`: mono uppercase role/resource labels (Admin, Beta), no dot.
 * Status of an operation is not a badge: use the `StatusPill` molecule (text + icon).
 */
export const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border whitespace-nowrap",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ],
  {
    variants: {
      variant: {
        default: "rounded-full border-transparent bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground",
        secondary: "rounded-full border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground",
        outline: "rounded-full border-border px-2 py-0.5 text-xs font-medium text-foreground",
        destructive: "rounded-full border-transparent bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground",
        count:
          "min-w-5 rounded-full border-transparent bg-sidebar-primary px-1.5 font-mono text-[10.5px] leading-[1.4] text-sidebar-primary-foreground tabular-nums",
        tag: "rounded-[4px] border-border px-1.5 font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase",
        "tag-blue":
          "rounded-[4px] border-blue/30 bg-blue/14 px-1.5 font-mono text-[9.5px] tracking-[0.08em] text-blue-foreground uppercase",
        "tag-violet":
          "rounded-[4px] border-violet/30 bg-violet/14 px-1.5 font-mono text-[9.5px] tracking-[0.08em] text-violet-foreground uppercase",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeVariantProps = VariantProps<typeof badgeVariants>;
